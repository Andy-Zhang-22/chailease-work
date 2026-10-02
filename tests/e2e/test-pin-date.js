// 固定這天：勾了的下次聯絡日不被照上限重排、挪到下個上班日、移到下週、關係企業連動動到
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9505);
const mk=(id,company,o)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:`1000000${id}`,grade:'',founded:'2019',capital:'12,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'},o);
const RECS=[mk('1','星辰精密工業股份有限公司'),mk('2','今天甲有限公司'),mk('3','今天乙固定有限公司'),mk('4','週二丙有限公司'),mk('5','老闆A有限公司'),mk('6','老闆B固定有限公司')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; let keep=''; try{ keep=localStorage.getItem('__now')||''; }catch(e){} window.__now=keep?Number(keep):new real('2026-10-05T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1200,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9505/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0'); localStorage.setItem('daily-cap','1');
   const st=(o)=>window.Store.setState({updatedAt:Date.now(),...o});
   await st({recordId:'2',outcome:'contacted',nextDate:'2026-10-05',lastDate:'2026-09-20'});
   await st({recordId:'3',outcome:'contacted',nextDate:'2026-10-05',lastDate:'2026-09-20',pinDate:true});
   await st({recordId:'4',outcome:'contacted',nextDate:'2026-10-07',lastDate:'2026-09-21'});
   // 5、6 同老闆：5 最近聯絡、下次 10/20；6 固定 10/08
   await st({recordId:'5',outcome:'contacted',nextDate:'2026-10-20',lastDate:'2026-10-01',group:'g1',groupIds:['5','6'],groupAt:Date.now()});
   await st({recordId:'6',outcome:'contacted',nextDate:'2026-10-08',lastDate:'2026-09-01',pinDate:true,group:'g1',groupIds:['5','6'],groupAt:Date.now()}); },RECS);
 const setDay=async(iso)=>{ await pg.evaluate((t)=>{ localStorage.setItem('__now',String(new Date(`${t}T09:00:00`).getTime())); },iso); await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300); };
 await setDay('2026-10-05');   // 週一
 // 記一通電話：下次聯絡下週二 10/07、勾固定
 await pg.locator('#cards .card:has-text("星辰") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const form=pg.locator('#drawerBody .logform').first();
 await form.locator('textarea').fill('老闆說下週二再打'); await form.locator('input[type=date]').fill('2026-10-07'); await form.locator('input[type=date]').dispatchEvent('change');
 await form.locator('.pin-check').check(); await form.locator('button:has-text("儲存紀錄")').click(); await pg.waitForTimeout(600);
 const st1=await pg.evaluate(async()=>{ const s=await window.Store.allStates(); const x=s.find(x=>x.recordId==='1'); return {next:x.nextDate,pin:x.pinDate}; });
 chk(st1.next==='2026-10-07' && st1.pin===true, `存了下次聯絡與固定：${JSON.stringify(st1)}`);
 await pg.evaluate(()=>document.querySelector('#drawer .drawer-close').click()); await pg.waitForTimeout(300);
 chk(/📌 固定 10\/07/.test(await pg.locator('#cards .card:has-text("星辰")').textContent()), '卡片標 📌 固定 10/07');
 // 照上限重排（一天 1 家）：10/07 有星辰（固定）與丙 → 只挪丙
 const plan=await pg.evaluate(()=>{ const p=window.planDailyCap(1); return {moves:p.moves.map(m=>[m.id,m.from,m.to])}; });
 chk(plan.moves.some(m=>m[0]==='4') && !plan.moves.some(m=>m[0]==='1') && !plan.moves.some(m=>m[0]==='3') && !plan.moves.some(m=>m[0]==='6'), `重排只動沒固定的：${JSON.stringify(plan.moves)}`);
 // 今天挪到下個上班日：今天的甲、乙，乙固定 → 只挪 1 家
 const defer=pg.locator('#feedDefer');
 chk(/今天的 1 家挪到/.test(await defer.textContent()), `挪日的按鈕只算沒固定的：${await defer.textContent()}`);
 await defer.click(); await pg.waitForTimeout(300); await pg.click('.ask-overlay .btn-primary'); await pg.waitForTimeout(800);
 const after=await pg.evaluate(async()=>{ const s=await window.Store.allStates(); return ['2','3'].map(id=>s.find(x=>x.recordId===id).nextDate); });
 chk(after[0]==='2026-10-06' && after[1]==='2026-10-05', `甲挪到 10/6、固定的乙留在 10/5：${after}`);
 // 關係企業連動：6 固定 10/08，不被 5 的 10/20 蓋掉；最近聯絡日照連動
 const v6=await pg.evaluate(()=>{ const v=window.customerViews().find(v=>v.id==='6'); return {next:v.nextDate,last:v.lastDate,pin:v.pinDate}; });
 chk(v6.next==='2026-10-08' && v6.last==='2026-10-01' && v6.pin===true, `關係企業連動不動固定的下次聯絡日：${JSON.stringify(v6)}`);
 // 再記一通沒勾固定就解除
 await pg.locator('#cards .card:has-text("星辰") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const f2=pg.locator('#drawerBody .logform').first();
 chk(await f2.locator('.pin-check').isChecked(), '表單記得目前是固定的');
 await f2.locator('.pin-check').uncheck(); await f2.locator('textarea').fill('改天再說'); await f2.locator('input[type=date]').fill('2026-10-14'); await f2.locator('input[type=date]').dispatchEvent('change');
 await f2.locator('button:has-text("儲存紀錄")').click(); await pg.waitForTimeout(600);
 const st2=await pg.evaluate(async()=>{ const s=await window.Store.allStates(); const x=s.find(x=>x.recordId==='1'); return {next:x.nextDate,pin:x.pinDate}; });
 chk(st2.next==='2026-10-14' && st2.pin===false, `沒勾就解除：${JSON.stringify(st2)}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
