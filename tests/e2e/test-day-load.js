// 短期內要聯絡的太多：要看得到每個上班日各有幾家，並且照「一天最多 N 家」把超過的往後挪。
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9461);

// 2026-09-28 是週一（09/28 教師節放假 → 第一個上班日是 09/29 週二）
const TODAY='2026-10-05';   // 週一，之後兩週沒有國定假日
const mk=(i,next,extra)=>({id:`R${i}`,source:'A.csv',company:`第${String(i).padStart(3,'0')}號公司`,aliases:[],
 taxId:String(10000000+i),grade:'',founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[],owner:'王',
 keyman:'',industry:'',address:'新北市新莊區',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],
 outcome:'contacted',nextDate:next,lastDate:'',addedDate:'2026-09-01',country:'台灣',importedAt:1,...extra});

const SEED=[];
let n=0;
for(let i=0;i<8;i++) SEED.push(mk(++n,'2026-09-30'));          // 逾期 8 家
for(let i=0;i<30;i++) SEED.push(mk(++n,TODAY));                // 今天 30 家
for(let i=0;i<25;i++) SEED.push(mk(++n,'2026-10-06'));         // 明天 25 家
for(let i=0;i<3;i++) SEED.push(mk(++n,'2026-10-07'));          // 後天只有 3 家
for(let i=0;i<6;i++) SEED.push(mk(++n,'2026-10-10'));          // 週六 → 要算到 10/12 週一
SEED.push(mk(++n,'2026-12-20'));                                // 視野之外

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 const openLoad=async()=>{ await pg.click('#btnMenu'); await pg.click('[data-act="day-load"]'); await pg.waitForSelector('.day-load'); };
 const rows=()=>pg.evaluate(()=>[...document.querySelectorAll('.day-row')].map(r=>({
   when:r.querySelector('.day-when').textContent, n:r.querySelector('.day-n').textContent, over:r.classList.contains('is-over')})));
 const byDate=()=>pg.evaluate(async()=>{
   const st=await window.Store.allStates(); const rec=await window.Store.allRecords();
   const m={}; rec.forEach(r=>{ const s=st.find(x=>x.recordId===r.id);
     const d=(s&&s.nextDate)||r.nextDate; m[d]=(m[d]||0)+1; }); return m; });

 await pg.goto('http://localhost:9461/index.html'); await pg.waitForSelector('#dropzone');
 await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('main-cap','20'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);

 // --- 負載表：看得到哪幾天爆了 ---
 await openLoad();
 const r0=await rows();
 chk(r0.length===20, `列出 20 個上班日：${r0.length}`);
 chk(r0[0].when.startsWith('2026/10/5')&&r0[0].n==='38 家'&&r0[0].over,
   `今天 38 家（30＋逾期 8）並標成超載：${r0[0].when} ${r0[0].n} over=${r0[0].over}`);
 chk(r0[1].n==='25 家'&&r0[1].over, `明天 25 家也超載：${r0[1].n}`);
 chk(r0[2].n==='3 家'&&!r0[2].over, `後天只有 3 家、沒超載：${r0[2].n}`);
 const sat=r0.find(x=>x.when.startsWith('2026/10/12'));
 chk(sat&&sat.n==='6 家', `排在週六的算到下一個上班日 10/12：${sat&&sat.n}`);
 const head=(await pg.textContent('#editorBody .rule-verdict')).replace(/\s+/g,' ');
 chk(/有 2 天超過上限，多出 23 家/.test(head), `摘要算得出多出幾家：${head}`);
 const note=(await pg.textContent('#editorBody p.muted')).replace(/\s+/g,' ');
 chk(/其中 8 家已逾期/.test(note)&&/1 家排在.*之後，沒算進來/.test(note), `逾期與視野外都講明：${note}`);

 // --- 點某一天只看那天 ---
 await pg.click('.day-row:nth-child(3)'); await pg.waitForTimeout(600);
 chk(/顯示 3 \/ 3/.test(await pg.textContent('#listSummary')), `點一天就只看那天：${await pg.textContent('#listSummary')}`);
 await pg.click('#btnResetFilters'); await pg.waitForTimeout(400);

 // --- 照上限重排 ---
 await openLoad();
 await pg.click('#editorBody button:has-text("照上限重排")');
 await pg.waitForSelector('.ask-overlay');
 const ask=(await pg.textContent('.ask-overlay .ask-text')).replace(/\s+/g,' ');
 chk(/一天最多 20 家/.test(ask)&&/家會被往後挪/.test(ask), `問話講清楚：${ask.slice(0,80)}`);
 chk(/只會往後、不會往前/.test(ask), '講明不會往前挪');
 await pg.click('.ask-overlay .ask-actions .btn:has-text("重排")');
 await pg.waitForTimeout(2500);

 const after=await byDate();
 const workdays=['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-12','2026-10-13'];
 chk(workdays.every(d=>(after[d]||0)<=20), `每個上班日都不超過 20 家：${JSON.stringify(after)}`);
 chk((after['2026-10-05']||0)===20, `今天剛好排滿 20 家：${after['2026-10-05']}`);
 chk(!Object.keys(after).some(d=>d<TODAY), `沒有任何一家還留在過去：${Object.keys(after).filter(d=>d<TODAY)}`);
 chk((after['2026-12-20']||0)===1, '視野之外那家沒被動到');

 // 總數不變
 const total=Object.values(after).reduce((a,b)=>a+b,0);
 chk(total===SEED.length, `總數沒變：${total} / ${SEED.length}`);

 // 重排完視窗留著、而且已經重畫成新的負載
 const flat=await rows();
 chk(flat.slice(0,3).every(x=>!x.over), `重排完當場看得到不再超載：${flat.slice(0,3).map(x=>x.n).join(' ')}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);

 // --- 復原 ---
 await pg.click('#btnMenu');
 chk(!(await pg.locator('[data-act="spread-undo"]').isHidden()), '「復原剛才的重排」冒出來了');
 chk(await pg.locator('[data-act="spread-due"]').count()===0, '舊的「分散到未來 15 個工作天」已經拿掉了');
 await pg.click('[data-act="spread-undo"]'); await pg.waitForTimeout(2500);
 const back=await byDate();
 chk((back['2026-09-30']||0)===8&&(back[TODAY]||0)===30&&(back['2026-10-06']||0)===25,
   `復原回原本的日期：${JSON.stringify(back)}`);
 chk(await pg.locator('[data-act="spread-undo"]').isHidden(), '復原過後就不再顯示那個選項');

 // --- 上限改成 10 ---
 await openLoad();
 await pg.fill('#editorBody .cap-input','10');
 await pg.dispatchEvent('#editorBody .cap-input','change'); await pg.waitForTimeout(700);
 const r1=await rows();
 chk(r1[2].n==='3 家'&&!r1[2].over&&r1[1].over, `改上限之後重新判斷哪幾天超載：${r1.slice(0,3).map(x=>x.n+(x.over?'!':'')).join(' ')}`);
 chk(await pg.evaluate(()=>localStorage.getItem('main-cap'))==='10', '主力上限記起來了');

 console.log('ERRORS:', errs.length?errs:'none');
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
