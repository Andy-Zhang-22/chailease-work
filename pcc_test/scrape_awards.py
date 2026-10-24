"""採購網決標公告：第一輪只探路——打開查詢頁，印表單欄位（input 名稱、select 選項數）、連結，不抓內容。
之後照探路看到的結構補成真的抓取（最近 7 天、前 20 筆、進明細頁、每家得標廠商一列）。"""
import re, sys, time
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
BLOCK_RE = re.compile(r"驗證碼|captcha|請登入|登入後|Access Denied|拒絕存取|too many requests", re.I)
CANDIDATES = [
    "https://web.pcc.gov.tw/prkms/tender/common/basic/indexTenderBasic",
    "https://web.pcc.gov.tw/prkms/tender/common/advanced/indexTenderAdvanced",
    "https://web.pcc.gov.tw/prkms/tender/common/bulletion/readBulletion",
    "https://web.pcc.gov.tw/prkms/tender/common/noticeDate/readNoticeDate",
    "https://web.pcc.gov.tw/prkms/tender/common/basic/readTenderBasic",
]

def pause():
    time.sleep(2.5)

def describe(page, label):
    html = page.content()
    print(f"== {label}")
    print(f"   url: {page.url}")
    print(f"   title: {page.title()[:80]}  bytes: {len(html)}")
    if BLOCK_RE.search(html):
        print("   ！！頁面有驗證碼／登入／阻擋字樣，停止")
        return False
    forms = page.query_selector_all("form")
    print(f"   form {len(forms)} 個")
    for fi, f in enumerate(forms[:4]):
        print(f"   form[{fi}] action={f.get_attribute('action')} method={f.get_attribute('method')} id={f.get_attribute('id')} name={f.get_attribute('name')}")
        for el in f.query_selector_all("input, select, textarea, button")[:60]:
            tag = el.evaluate("e => e.tagName.toLowerCase()")
            name = el.get_attribute("name") or ""
            typ = el.get_attribute("type") or ""
            idv = el.get_attribute("id") or ""
            extra = ""
            if tag == "select":
                opts = el.query_selector_all("option")
                extra = f" options={len(opts)} 前幾個=" + " / ".join((o.inner_text() or "").strip()[:12] for o in opts[:6])
            elif tag in ("button",) or typ in ("submit", "button"):
                extra = f" text={(el.inner_text() or '').strip()[:20]}"
            elif typ in ("radio", "checkbox"):
                extra = f" value={el.get_attribute('value')}"
            print(f"      {tag} type={typ} name={name} id={idv}{extra}")
    links = page.query_selector_all("a")
    hits = []
    for a in links:
        t = (a.inner_text() or "").strip()
        h = a.get_attribute("href") or ""
        if re.search(r"決標|標案查詢|進階|公告日期|詳細|明細", t) or re.search(r"tender|award|notice", h, re.I):
            hits.append((t[:30], h[:140]))
    print(f"   連結 {len(links)} 個，相關 {len(hits)} 個")
    for t, h in hits[:30]:
        print(f"      - {t} → {h}")
    return True

def main():
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(user_agent=UA, locale="zh-TW", viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        page.set_default_timeout(60000)
        try:
            page.goto("https://web.pcc.gov.tw/", wait_until="domcontentloaded")
            if not describe(page, "首頁"):
                return
            pause()
            for u in CANDIDATES:
                try:
                    r = page.goto(u, wait_until="domcontentloaded")
                    print(f"\n-- {u} → HTTP {r.status if r else '?'}")
                    if not describe(page, u.rsplit('/', 1)[-1]):
                        return
                except Exception as e:
                    print(f"\n-- {u} 失敗：{e}")
                pause()
        finally:
            br.close()

if __name__ == "__main__":
    main()
