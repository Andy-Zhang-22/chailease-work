// 分頁列只剩「重點推廣名單｜找名單｜篩選」：七個來源在找名單底下的第二排，統計、規則從右上選單進；?tab= 網址照舊
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
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); });
 const tabs=await pg.$$eval('#tabs .tab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(tabs.length===3 && tabs[0].startsWith('重點推廣名單') && tabs[1]==='找名單' && /篩選/.test(tabs[2]), `分頁列三個：${tabs.join(' | ')}`);
 chk(await pg.locator('#subtabs').isHidden(), '在重點推廣名單時第二排收著');
 // 按找名單：第二排出現、預設登記清冊
 await pg.click('.tab[data-tab="sources"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#subtabs').isVisible() && (await pg.$$eval('#subtabs .subtab',a=>a.length))===7, '第二排七個來源');
 chk(await pg.locator('.tab[data-tab="sources"]').evaluate(e=>e.classList.contains('is-active')) && await pg.locator('.subtab[data-tab="leads"]').evaluate(e=>e.classList.contains('is-active')) && await pg.locator('#paneLeads').isVisible(), '找名單亮著、預設登記清冊');
 const subs=await pg.$$eval('#subtabs .subtab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(subs[0].startsWith('每月公司設立／變更登記清冊') && subs[1].startsWith('動產擔保') && subs[2].startsWith('上市櫃') && subs[6].startsWith('剛開電子發票'), `名字縮短：${subs.join(' | ')}`);
 // 切到出進口廠商：pane 換、搜尋欄提示換、記住
 await pg.click('.subtab[data-tab="trade"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneTrade').isVisible() && await pg.locator('#paneLeads').isHidden() && /出進口廠商/.test(await pg.getAttribute('#search','placeholder')), '切到出進口廠商');
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 chk(await pg.locator('#subtabs').isHidden() && await pg.locator('#paneList').isVisible(), '回重點推廣名單：第二排收起來');
 await pg.click('.tab[data-tab="sources"]'); await pg.waitForTimeout(300);
 chk(await pg.locator('#paneTrade').isVisible(), '再按找名單回到上次看的出進口廠商');
 // 統計、規則從右上選單
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="stats"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneStats').isVisible() && await pg.locator('#subtabs').isHidden() && (await pg.$$eval('#tabs .tab.is-active',a=>a.length))===0, '選單進統計：分頁列不亮、第二排收起來');
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="rules"]'); await pg.waitForTimeout(400);
 chk(await pg.locator('#paneRules').isVisible(), '選單進規則');
 // ?tab= 網址照舊
 await pg.goto('http://localhost:9511/index.html?tab=nhi'); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 chk(await pg.locator('#paneNhi').isVisible() && await pg.locator('.subtab[data-tab="nhi"]').evaluate(e=>e.classList.contains('is-active')), '?tab=nhi 直接開到剛開始請人');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
