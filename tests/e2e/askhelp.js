/*
 * 網站已經不用瀏覽器原生的 confirm()／prompt()，改成自己畫的 .ask-overlay。
 * 測試原本靠 pg.on('dialog') 接，現在要改接這個框。
 *
 * installAsk(pg, answer)：裝一個輪詢，框一出現就記下訊息並自動按掉。
 *   answer=true  → 按主要按鈕（確定／刪掉／全部刪掉…）
 *   answer=false → 按取消
 * 訊息累積在 window.__asked，用 asked(pg) 取出來，語意跟原本的 dialogs 陣列一樣。
 *
 * 用 addInitScript 是因為很多測試會 reload，要每次導頁都重裝。
 */
async function installAsk(pg, answer = true) {
  await pg.addInitScript((ans) => {
    window.__asked = [];
    setInterval(() => {
      document.querySelectorAll('.ask-overlay').forEach((o) => {
        if (o.__handled) return;
        o.__handled = true;
        const t = o.querySelector('.ask-text');
        window.__asked.push((t ? t.textContent : '').replace(/\s+/g, ' '));
        const acts = [...o.querySelectorAll('.ask-actions .btn')];
        const pick = ans
          ? (acts[acts.length - 1] || o.querySelector('.ask-list .btn'))
          : acts.find((b) => /取消/.test(b.textContent));
        if (pick) pick.click();
      });
    }, 40);
  }, answer);
}

/** 目前為止跳過的確認框訊息。 */
const asked = (pg) => pg.evaluate(() => window.__asked || []);
/** 清掉已記錄的訊息（對應原本的 dialogs.length=0）。 */
const clearAsked = (pg) => pg.evaluate(() => { window.__asked = []; });
/** 手動按掉一個框（要指定按哪顆時用）。 */
async function clickAsk(pg, label, timeout = 8000) {
  await pg.waitForSelector('.ask-overlay', { timeout });
  await pg.click(`.ask-overlay .btn:has-text("${label}")`);
  await pg.waitForTimeout(350);
}

module.exports = { installAsk, asked, clearAsked, clickAsk };
