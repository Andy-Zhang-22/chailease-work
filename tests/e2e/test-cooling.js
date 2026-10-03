// 沒接幾次自動降溫（3 次兩週後、5 次冷名單）、六個來源的配額比例
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9512);
const TODAY='2026-10-05';   // 週一
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2019',capital:'12,000',phoneRaw:'02-2990-1234',phones:[{digits:'0229901234',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路100號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9512/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0');
   // 晨光已經連續未接 2 次
   await window.Store.addLog({recordId:'1',date:'2026-10-01',text:'未接',outcome:'noanswer',createdAt:1000});
   await window.Store.addLog({recordId:'1',date:'2026-10-02',text:'未接',outcome:'noanswer',createdAt:2000}); },
   [mk('1','晨光貿易有限公司','70000001'), mk('2','遠帆國際開發有限公司','70000002')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);

 // 第 3 次未接、沒填日期 → 自動排到兩週後（10/19 是週一）
 const logMissed=async()=>{ await pg.locator('#cards .card:has-text("晨光") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
   await pg.selectOption('#drawerBody select', 'noanswer'); await pg.fill('#drawerBody textarea','未接'); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(600);
   await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200); };
 await logMissed();
 let v=await pg.evaluate(()=>{ const x=window.customerViews().find(v=>v.company==='晨光貿易有限公司'); return {next:x.nextDate,cold:x.cold,outcome:x.outcome}; });
 chk(v.next==='2026-10-19' && !v.cold, `第 3 次未接自動排到兩週後：${JSON.stringify(v)}`);
 chk(/連續未接 3 次，自動排到兩週後/.test(await pg.textContent('#toast')), `提示有講：${await pg.textContent('#toast')}`);
 // 第 4 次還是兩週後；第 5 次 → 冷名單
 await logMissed(); await logMissed();
 v=await pg.evaluate(()=>{ const x=window.customerViews().find(v=>v.company==='晨光貿易有限公司'); return {next:x.nextDate,cold:x.cold}; });
 chk(!v.next && v.cold===TODAY, `第 5 次未接移到冷名單、不排日期：${JSON.stringify(v)}`);
 chk(/❄ 冷名單/.test(await pg.locator('#cards .card:has-text("晨光") .card-top').textContent()), '卡片標 ❄ 冷名單');
 const coldChips=await pg.$$eval('#fltCold .chip',a=>a.map(x=>x.textContent.replace(/\s+/g,'')).join('|'));
 chk(/1冷名單（未接太多次）\|1正常/.test(coldChips), `篩選有冷名單籤：${coldChips}`);
 // 打通一次就解除
 await pg.locator('#cards .card:has-text("晨光") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 await pg.selectOption('#drawerBody select', 'contacted'); await pg.fill('#drawerBody textarea','接通了，下週再聊'); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(600);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(200);
 v=await pg.evaluate(()=>{ const x=window.customerViews().find(v=>v.company==='晨光貿易有限公司'); return {cold:x.cold}; });
 chk(!v.cold, `接通之後冷名單解除：${JSON.stringify(v)}`);

 // 六個來源的配額比例
 const sp=await pg.evaluate(()=>[window.splitByShares([99,99,99,99,99,99],25,[10,5,5,0,2,3]), window.splitByShares([2,9,9,9,9,9],25,[10,5,5,0,2,3]), window.splitByShares([9,9,9,9,9,9],25,null), window.splitByShares([1,1,1,1,1,1],25,[10,0,0,0,0,0])]);
 chk(JSON.stringify(sp)==='[[10,5,5,0,2,3],[2,7,7,0,4,5],[5,4,4,4,4,4],[1,1,1,1,1,1]]', `照比例分、不夠的讓給有比例的、比例 0 最後補位：${JSON.stringify(sp)}`);
 await pg.click('#btnMenu'); await pg.click('[data-act="day-load"]'); await pg.waitForSelector('#editorBody .share-input'); await pg.waitForTimeout(200);
 const shares=pg.locator('#editorBody .share-input');
 chk((await shares.count())===6 && /空白＝平分（5、4、4、4、4、4）/.test(await pg.textContent('#editorBody .share-hint')), `六格比例、預設平分：${await pg.textContent('#editorBody .share-hint')}`);
 for (const [i,val] of [[0,'10'],[1,'5'],[2,'5'],[3,'0'],[4,'2'],[5,'3']]) { await shares.nth(i).fill(val); await shares.nth(i).dispatchEvent('change'); }
 await pg.waitForTimeout(200);
 chk(/加起來 25，25 家照比例分：10、5、5、0、2、3/.test(await pg.textContent('#editorBody .share-hint')) && (await pg.evaluate(()=>localStorage.getItem('feed-shares')))==='10,5,5,0,2,3', `填了比例會存、提示算給你看：${await pg.textContent('#editorBody .share-hint')}`);
 await shares.nth(0).fill(''); await shares.nth(0).dispatchEvent('change'); await pg.waitForTimeout(100);
 chk((await pg.evaluate(()=>localStorage.getItem('feed-shares')))==='0,5,5,0,2,3', '一格空白當 0');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
