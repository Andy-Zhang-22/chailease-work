/*
 * 網路查擴張訊號（版本 322）。
 *
 * 使用者：「做 A，但我希望你挑出名單後，也在網路上搜尋到有擴張訊號的資訊再給我名單，這樣相對精準」。
 * 後台挑每日新名單時，候選（額度兩倍、有電話的那段）先交給 Claude 用網路搜尋查最近一年的擴張訊號：
 * 徵才、新廠／新設備／搬遷擴大、得標、增資、新產品新市場、營收成長。查到的排前面（是排序不是門檻，
 * 使用者定的規則），訊號那句寫進訪談內容、來源網址存在客戶的追蹤狀態（詳細頁看得到）。
 *
 * 送出去的只有公司名、統編、地址；不送電話、負責人、備註。
 * 身分用 Workload Identity 聯合（使用者：「不然我怕會有洩漏金鑰的風險」）：workflow 跟 GitHub 要一次性的 OIDC token 寫進檔案，
 * SDK 看 ANTHROPIC_FEDERATION_RULE_ID／ANTHROPIC_ORGANIZATION_ID／ANTHROPIC_SERVICE_ACCOUNT_ID／ANTHROPIC_IDENTITY_TOKEN_FILE
 * 自己拿去換短效的存取權杖，repo 裡沒有任何 sk-ant 金鑰。也接受 ANTHROPIC_API_KEY（本機測試用）。
 * 這個 repo 的 Actions 紀錄是公開的：這裡只印筆數。
 */
const MODEL = 'claude-opus-5-5';
const SYSTEM = [
  '你是台灣租賃公司（中租）企金業務的研究助理。給你一家台灣公司的名稱、統編、地址，請用網路搜尋查這家公司「最近一年」有沒有擴張訊號：',
  '徵才（104、1111、官網）、新廠或新廠房、新設備、搬遷擴大、政府採購得標、增資、新產品或新市場、營收成長、展店、併購。',
  '只採信查得到來源的事；同名公司要用統編或地址確認是同一家，確認不了就當沒有。查不到就老實說沒有。',
  '最後只回一段 JSON，不要其他文字：',
  '{"expansion": true或false, "score": 0到3（0 沒有、1 弱、2 明確、3 很強），"summary": "一句話、繁體中文、30 字內、寫具體事實與來源名稱，例如「104 正在徵 8 名作業員（2026/09）」", "sources": ["網址", ...]}',
].join('\n');

/** 從回覆文字裡把最後一段 JSON 挖出來；挖不到或格式不對回 null */
export function parseIntel(text) {
  const s = String(text || '');
  const start = s.lastIndexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  // 可能有巢狀：從最後一個 { 往前找到第一個能解析的
  for (let i = start; i >= 0; i = s.lastIndexOf('{', i - 1)) {
    try {
      const o = JSON.parse(s.slice(i, end + 1));
      if (!o || typeof o !== 'object') continue;
      const score = Math.max(0, Math.min(3, Math.round(Number(o.score) || 0)));
      const expansion = !!o.expansion && score > 0;
      return {
        expansion, score: expansion ? score : 0,
        summary: expansion ? String(o.summary || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '',
        sources: Array.isArray(o.sources) ? o.sources.filter((u) => /^https?:\/\//.test(String(u))).map(String).slice(0, 5) : [],
      };
    } catch (e) { if (i === 0) break; }
  }
  return null;
}

const textOf = (content) => (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

/** 查一家；回 parseIntel 的結果，失敗回 null（呼叫端只印筆數） */
async function researchOne(client, item, { maxSearches }) {
  const messages = [{ role: 'user', content: `公司名稱：${item.name}\n統一編號：${item.taxId || '（不詳）'}\n地址：${item.address || '（不詳）'}` }];
  let res = null;
  for (let round = 0; round < 3; round += 1) {
    res = await client.beta.messages.create({
      model: MODEL, max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches }],
      messages,
    });
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content });   // 伺服器端的搜尋迴圈暫停了：原樣送回去接著跑
  }
  if (!res || res.stop_reason === 'refusal') return null;
  return parseIntel(textOf(res.content));
}

/**
 * @param {{key:string,name:string,taxId?:string,address?:string}[]} items
 * @returns {Promise<{results: Object<string, object|null>, asked: number, withSignals: number, failed: number, usage: {input:number, output:number, searches:number}}>}
 */
export async function researchCompanies(items, { apiKey = '', concurrency = 3, maxSearches = 4, log = () => {} } = {}) {
  const results = {};
  const usage = { input: 0, output: 0, searches: 0 };
  let withSignals = 0; let failed = 0;
  if (!items.length) return { results, asked: 0, withSignals, failed, usage };
  const { default: Anthropic } = await import('@anthropic-ai/sdk');   // 只有後台裝了套件才載；parseIntel 的測試不用
  // 沒給金鑰就不帶 apiKey：SDK 會自己從環境變數走 Workload Identity 聯合（或 ANTHROPIC_API_KEY）。
  // workflow 沒設的變數會是空字串，SDK 可能當成「有設」（空的 ANTHROPIC_API_KEY 會壓過聯合），先清掉
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_PROFILE', 'ANTHROPIC_WORKSPACE_ID', 'ANTHROPIC_IDENTITY_TOKEN_FILE', 'ANTHROPIC_IDENTITY_TOKEN']) {
    if (process.env[k] !== undefined && !String(process.env[k]).trim()) delete process.env[k];
  }
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}), maxRetries: 2, timeout: 120000 });
  const queue = items.slice();
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        const r = await researchOne(client, item, { maxSearches });
        results[item.key] = r;
        if (r && r.expansion) withSignals += 1;
        if (!r) failed += 1;
      } catch (err) {
        failed += 1; results[item.key] = null;
        log(`查一家失敗：${String(err && err.message ? err.message : err).slice(0, 80)}`);   // 不印公司名
        if (err && (err.status === 401 || err.status === 403)) { queue.length = 0; log('金鑰不對或沒權限，這輪停止'); }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return { results, asked: items.length, withSignals, failed, usage };
}
