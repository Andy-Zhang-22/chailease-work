// 探路（一次性，看完就刪）：yes123 從 GitHub Actions 連得到嗎、公司搜尋的入口長什麼樣。只印狀態碼、標題、表單與連結樣式，不印任何公司或個人資料。
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const pages = ['https://www.yes123.com.tw/', 'https://www.yes123.com.tw/wk_index/', 'https://www.yes123.com.tw/wk_index/joblist.asp'];
for (const url of pages) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'zh-TW' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await r.arrayBuffer());
    let text = buf.toString('utf8');
    if (/charset=big5/i.test(text.slice(0, 2000))) text = new TextDecoder('big5').decode(buf);
    console.log(`\n== ${url} → ${r.status} ${r.headers.get('content-type')} ${buf.length} bytes（最後網址 ${r.url}）`);
    console.log('標題：', (/<title>([^<]*)<\/title>/i.exec(text) || [])[1]);
    const forms = [...text.matchAll(/<form[^>]*>/gi)].map((m) => m[0].slice(0, 200));
    console.log('表單：', forms.length); forms.slice(0, 8).forEach((f) => console.log('  ', f));
    const inputs = [...text.matchAll(/<(input|select)[^>]*name="([^"]+)"[^>]*>/gi)].map((m) => `${m[1]}:${m[2]}`);
    console.log('欄位名：', [...new Set(inputs)].slice(0, 40).join(' '));
    const links = [...new Set([...text.matchAll(/href="([^"]*(?:comp|search|find|job)[^"]*)"/gi)].map((m) => m[1].replace(/\d{5,}/g, 'N')))];
    console.log('像搜尋的連結樣式：', links.length); links.slice(0, 30).forEach((l) => console.log('  ', l));
    if (/驗證|captcha|cloudflare|請稍候|blocked/i.test(text)) console.log('＊頁面有驗證／阻擋字樣');
  } catch (e) { console.log(`\n== ${url} → 失敗 ${e.message}`); }
}
