/** 探路：用真的 Chromium 開 findbiz（Cloudflare 擋 node fetch）。看完連同 workflow 一起刪。 */
import { chromium } from 'playwright';
const TAX = '21505879'; const NAME = '真愛奇蹟';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'zh-TW', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const show = async (label, url) => {
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    const html = await page.content();
    const title = await page.title();
    const links = [...new Set([...html.matchAll(/\/fts\/business\/\d+\/\d+|qryDetail\('[^']+'|\/fts\/query\/Query\w+Detail\/[^"' ]+/g)].map((m) => m[0]))].slice(0, 8);
    console.log(`\n== ${label}\n   ${url}\n   HTTP ${res && res.status()} → ${page.url()}\n   title: ${title.slice(0, 80)}\n   有名稱: ${html.includes(NAME)}  有負責人: ${html.includes('負責人')}  Cloudflare: ${/cloudflare|Attention Required/i.test(html)}  長度 ${html.length}\n   連結: ${links.join(' | ')}`);
    return html;
  } catch (e) { console.log(`\n== ${label}\n   ✗ ${e.message}`); return ''; }
};
await show('business/統編（沒序號）', `https://findbiz.nat.gov.tw/fts/business/${TAX}`);
const q = `https://findbiz.nat.gov.tw/fts/query/QueryList/queryList.do?qryCond=${TAX}&infoType=D&qryType=cmpyType&cmpyType=true&brCmpyType=true&busmType=true&factType=true&lmtdType=true&isAlive=all`;
const html = await show('queryList 帶統編', q);
// 結果列的原始碼（找序號藏在哪）
const i = html.indexOf(NAME);
if (i >= 0) console.log(`\n結果列附近原始碼：\n${html.slice(Math.max(0, i - 1500), i + 800).replace(/\s+/g, ' ')}`);
// 點結果那一列，看跳去哪
try {
  const link = page.locator(`a:has-text("${NAME}")`).first();
  if (await link.count()) { await link.click(); await page.waitForTimeout(6000); console.log(`\n點了名稱 → ${page.url()}  title: ${await page.title()}`); }
  else console.log('\n找不到可點的名稱連結');
} catch (e) { console.log(`\n點名稱失敗：${e.message}`); }
await browser.close();
console.log('\n完成。');
