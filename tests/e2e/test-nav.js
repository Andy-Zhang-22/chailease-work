// 分頁列只剩「重點推廣名單｜行事曆｜找名單｜篩選」：找名單底下一排＝全部（合併）＋七份名單＋上市櫃；規則從右上選單進；?tab= 網址照舊
// （版本 314 拿掉統計、剛開電子發票的獨立頁，原本「新名單／上市櫃」那一排併掉；上市櫃留著排最後）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9511);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));   // 這支只看導覽，清冊一律沒有
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9511/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); });
 const tabs=await pg.$$eval('#tabs .tab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(tabs.length===4 && tabs[0].startsWith('重點推廣名單') && tabs[1].startsWith('行事曆') && tabs[2]==='找名單' && /篩選/.test(tabs[3]), `分頁列四個：${tabs.join(' | ')}`);
 chk(await pg.locator('#subtabs').isHidden(), '在重點推廣名單時第二排收著');
 // 按找名單：第二排一排＝全部（合併）＋七份名單＋上市櫃，預設開合併頁
 await pg.click('.tab[data-tab="sources"]'); await pg.waitForTimeout(400);
 const subs=await pg.$$eval('#subtabs .subtab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(await pg.locator('#subtabs').isVisible() && subs.length===9 && subs[0].startsWith('全部（合併）') && subs[1].startsWith('登記清冊') && subs[3].startsWith('商行／企業社') && subs[6].startsWith('新設工廠') && subs[7].startsWith('產業名單') && subs[8].startsWith('上市櫃') && !subs.some(t=>/電子發票/.test(t)), `第二排全部＋七份＋上市櫃：${subs.join(' | ')}`);
 chk(await pg.locator('.tab[data-tab="sources"]').evaluate(e=>e.classList.contains('is-active')) && await pg.locator('#subtabs .subtab[data-tab="mix"]').evaluate(e=>e.classList.contains('is-active')) && await pg.locator('#paneMix').isVisible(), '找名單預設開合併頁');
 await pg.click('#subtabs .subtab[data-tab="biz"]'); await pg.waitForTimeout(300);
 chk(await pg.locator('#paneBiz').isVisible() && await pg.locator('#paneMix').isHidden() && await pg.locator('#subtabs .subtab[data-tab="biz"]').evaluate(e=>e.classList.contains('is-active')), '商行在同一排');
 // 切到出進口廠商：pane 換、搜尋欄提示換、記住
 await pg.click('#subtabs .subtab[data-tab="trade"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneTrade').isVisible() && await pg.locator('#paneBiz').isHidden() && /出進口廠商/.test(await pg.getAttribute('#search','placeholder')), '切到出進口廠商');
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 chk(await pg.locator('#subtabs').isHidden() && await pg.locator('#paneList').isVisible(), '回重點推廣名單：第二排收起來');
 await pg.click('.tab[data-tab="sources"]'); await pg.waitForTimeout(300);
 chk(await pg.locator('#paneTrade').isVisible(), '再按找名單回到上次看的出進口廠商');
 // 規則從右上選單（進階）；統計那頁拿掉了
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('#menu [data-act="rules"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneRules').isVisible() && await pg.locator('#subtabs').isHidden() && (await pg.$$eval('#tabs .tab.is-active',a=>a.length))===0, '選單進規則：分頁列不亮、第二排收起來');
 chk((await pg.locator('#menu [data-act="stats"]').count())===0 && (await pg.locator('#paneStats').count())===0, '統計頁拿掉了');
 // 上市櫃在同一排最後
 await pg.click('.tab[data-tab="sources"]'); await pg.click('#subtabs .subtab[data-tab="listed"]'); await pg.waitForTimeout(300);
 chk(await pg.locator('#paneListed').isVisible() && await pg.locator('#subtabs .subtab[data-tab="listed"]').evaluate(e=>e.classList.contains('is-active')), '上市櫃在同一排');
 // ?tab= 網址照舊；拿掉的分頁名字就留在重點推廣名單
 await pg.goto('http://localhost:9511/index.html?tab=nhi'); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 chk(await pg.locator('#paneNhi').isVisible() && await pg.locator('#subtabs .subtab[data-tab="nhi"]').evaluate(e=>e.classList.contains('is-active')), '?tab=nhi 直接開到剛開始請人');
 await pg.goto('http://localhost:9511/index.html?tab=einv'); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 chk(await pg.locator('#paneList').isVisible() && await pg.locator('#subtabs').isHidden(), '?tab=einv（拿掉的頁）留在重點推廣名單');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
