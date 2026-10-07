// 產業名單分頁（車輛相關業者、食品工廠、環保列管、營造業）：第三排有這一頁、讀資料、預設篩選、卡片（類別、剛出現、新工地）、
// 加入客戶名單帶電話與行業、開場白、來源漏斗、合併頁同一個統編合成一家
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9623);
const TODAY='2026-12-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='統編,名稱,類別,地址,資本額,實收資本額,首見年月,設立日期,組織別,行業代號,行業,電話,場所,新場所年月,新場所';
const ROWS=[
 ['54867253','名祿運通有限公司','汽車貨運業、小客車租賃業','新北市新莊區中正路100號','12000000','12000000','202611','108/09/03','有限公司','494099','其他汽車貨運','02-2960-0000'],
 ['24908600','宇駿遊覽有限公司','遊覽車客運業','新北市新莊區新泰路1號','30000000','30000000','202610','104/08/14','有限公司','493200','遊覽車客運',''],
 ['02198779','大板交通股份有限公司','計程車客運業','新北市板橋區文化路1號','8000000','8000000','202610','100/01/12','股份有限公司','493120','計程車客運',''],
 ['28501234','鼎築營造有限公司','營造業','新北市新莊區思源路5號','20000000','','202610','105/03/01','有限公司','439000','其他專門營造業','','工地 2 處','202611','新工地'],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-12-01T20:00:00.000Z',cities:['新北市'],baseline:'202610',total:4,newTotal:1,newSiteTotal:1,withPhone:1,byKind:{汽車貨運業:1,小客車租賃業:1,遊覽車客運業:1,計程車客運業:1,營造業:1},files:[{path:'industry.csv',rows:4}]};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.addInitScript(()=>{try{localStorage.setItem('leads-filters-open','1');localStorage.setItem('rate-filter-default','0');localStorage.setItem('registry-auto','0');localStorage.setItem('daily-feed-auto','0');localStorage.setItem('auto-rebalance','0');}catch(e){}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 await ctx.route('**/leads/industry/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/industry/industry.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9623/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 chk((await pg.$$eval('#mixtabs .subtab',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()))).some(t=>t.startsWith('產業名單')), '新名單第三排有「產業名單」');
 await pg.evaluate(()=>window.switchTab('industry')); await pg.waitForSelector('#industry-cards .card'); await pg.waitForTimeout(300);
 const sub=(await pg.textContent('#industry-sub')).replace(/\s+/g,' ');
 chk(/新北市 4 家/.test(sub) && /營造工地 1/.test(sub) && /起算 2026\/10/.test(sub), `標題：${sub}`);
 // 預設：資本額 500～6,000 萬、我的分公司（新莊）→ 宇駿、鼎築、名祿；照資本額排
 let names=await pg.$$eval('#industry-cards .card .card-name',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
 chk(names.length===3 && /宇駿/.test(names[0]) && /鼎築/.test(names[1]) && /名祿/.test(names[2]), `預設篩選後照資本額排：${names.join(' | ')}`);
 const cs=(await pg.locator('#industry-cards .card:has-text("鼎築")').textContent()).replace(/\s+/g,' ');
 chk(/新工地/.test(cs) && /🏗 營造工地/.test(cs) && /🏗 工地 2 處/.test(cs) && /🆕 2026\/11 多了新工地/.test(cs) && !/剛出現/.test(cs), `營造業卡片：${cs.slice(0,220)}`);
 const ct=(await pg.locator('#industry-cards .card:has-text("名祿")').textContent()).replace(/\s+/g,' ');
 chk(/剛出現/.test(ct) && /🚚 汽車貨運/.test(ct) && /🚗 租車/.test(ct) && /🆕 2026\/11 出現在產業名單/.test(ct) && /📞 02-2960-0000/.test(ct), `卡片：${ct.slice(0,220)}`);
 chk(!/剛出現/.test(await pg.locator('#industry-cards .card:has-text("宇駿")').textContent()), '起算時就有的不標剛出現');
 // 類別篩選
 await pg.click('#industry-reset'); await pg.waitForTimeout(150);
 await pg.fill('#industry-capMin',''); await pg.fill('#industry-capMax',''); await pg.locator('#industry-fBranch .chip:has-text("新莊分公司")').click(); await pg.waitForTimeout(200);
 await pg.locator('#industry-fKind .chip:has-text("計程車")').click(); await pg.waitForTimeout(200);
 names=await pg.$$eval('#industry-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(names.length===1 && /大板/.test(names[0]), `篩類別：${names.join('|')}`);
 await pg.locator('#industry-fKind .chip:has-text("計程車")').click(); await pg.waitForTimeout(200);
 // 加入一家：帶電話、行業、成立年、資本額；單張加入直接打開
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#industry-cards .card')].find(x=>x.textContent.includes('名祿')); c.querySelector('.industry-add-one').click(); });
 await pg.waitForTimeout(1200);
 const rec=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(x=>x.company==='名祿運通有限公司'); return r?{phone:r.phoneRaw,founded:r.founded,capital:r.capital,industry:r.industry,notes:r.notesRaw,source:r.source}:null; });
 chk(rec && rec.phone==='02-2960-0000' && rec.founded==='2019' && rec.capital==='12,000' && rec.industry==='其他汽車貨運' && /^產業名單：汽車貨運業、小客車租賃業，2026-11 新出現/.test(rec.notes) && /^產業名單-2026-12-05-1家\.csv$/.test(rec.source), `加進來的：${JSON.stringify(rec)}`);
 const op=(await pg.locator('#drawerBody .detail-opener').textContent().catch(()=>'')).replace(/\s+/g,' ');
 chk(/運輸／租車/.test(op), `開場白：${op}`);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 // 合併頁：這一頁的公司進得去，訊號有「車輛業者」「營造業（有工地）、剛有新工地」
 const mix=await pg.evaluate(async()=>{ const m=await window.mixCandidates(); return m.filter(x=>!x.mine && x.facts.some(f=>f.key==='in')).map(x=>`${x.name}|${x.signals.join('、')}`); });
 chk(mix.length===3 && mix.some(x=>/宇駿遊覽有限公司\|車輛業者/.test(x)) && mix.some(x=>/大板交通/.test(x)) && mix.some(x=>/鼎築營造有限公司\|.*營造業（有工地）.*剛有新工地/.test(x)), `合併頁有產業名單（名祿加進名單了，標已在名單）：${mix.join(' / ')}`);
 // 營造業加進來：備註寫新工地、開場白講新工地
 await pg.evaluate(()=>window.switchTab('industry')); await pg.waitForTimeout(300);
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#industry-cards .card')].find(x=>x.textContent.includes('鼎築')); c.querySelector('.industry-add-one').click(); });
 await pg.waitForTimeout(1200);
 const rec2=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(x=>x.company==='鼎築營造有限公司'); return r?r.notesRaw:''; });
 chk(/^產業名單：營造業，2026-11 新工地/.test(rec2), `營造業的備註：${rec2}`);
 const op2=(await pg.locator('#drawerBody .detail-opener').textContent().catch(()=>'')).replace(/\s+/g,' ');
 chk(/新工地/.test(op2), `營造業的開場白：${op2}`);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 // 統計的來源漏斗認得這個來源
 await pg.evaluate(()=>window.switchTab('stats')); await pg.waitForTimeout(400);
 chk(/產業名單/.test(await pg.textContent('#paneStats .funnel')), '來源漏斗列「產業名單」');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
