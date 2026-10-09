const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9093);
const today=(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;})();
const mk=(id,name,next,o)=>({id,source:'A.csv',company:name,aliases:[],taxId:'',grade:'',founded:'2015',capital:'10,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:'',display:'02-1111-1111'}],owner:'王',keyman:'陳經理',industry:'',address:'新北市新莊區中正路1號',addressActual:'',city:'',district:'',notesRaw:'2026/09/01 電話中聊',timeline:[],outcome:'contacted',nextDate:next,lastDate:'2026-09-01',addedDate:'2026-09-01',...o});
const SEED=[mk('1','今天甲',today),mk('2','今天乙',today),mk('3','明天丙','2099-01-01'),mk('4','禁打丁',today,{notesRaw:'2026/09/01 禁止推廣'})];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1300}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9093/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 const bar=(await pg.textContent('#remindBar')).replace(/\s+/g,' ');
 chk(await pg.isVisible('#remindBar')&&/今天要打（2）/.test(bar), `提醒列列出今天到期的 2 家（禁止推廣的不列）：${bar.slice(0,80)}`);
 chk(/今天\s*今天甲/.test(bar)&&/今天\s*今天乙/.test(bar)&&!/明天丙/.test(bar)&&!/禁打丁/.test(bar)&&/陳經理/.test(bar), '列出公司、KEYMAN，明天的與禁打的不列');
 chk(/今天要聯絡：今天(甲|乙)、今天(甲|乙)/.test(await pg.textContent('#toast')), `打開網站跳一次提示：${await pg.textContent('#toast')}`);
 chk(await pg.evaluate(()=>localStorage.getItem('due-notified'))===today, '記下今天已提醒');
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 chk(!/今天要聯絡：/.test(await pg.textContent('#toast')), '同一天再開不重複提示');
 await pg.click('#remindBar button:has-text("只看今天到期")'); await pg.waitForTimeout(400);
 chk(/顯示 2 \/ 2 筆/.test(await pg.textContent('#listSummary')), `「只看今天到期」套用聯絡時程篩選：${await pg.textContent('#listSummary')}`);
 await pg.click('#remindBar .remind-row.is-today .remind-open'); await pg.waitForSelector('#drawerBody h2');
 chk(/今天(甲|乙)/.test(await pg.textContent('#drawerBody h2')), '點列上的公司打開詳細頁');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 // 同時有回撥提醒：兩段都在
 await pg.evaluate(async()=>{ await window.Store.setState({recordId:'3',remindAt:Date.now()+3600000,remindNote:'',remindSetAt:Date.now(),updatedAt:Date.now()}); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1000);
 const bar2=(await pg.textContent('#remindBar')).replace(/\s+/g,' ');
 chk(/今天要打（3）/.test(bar2)&&/明天丙/.test(bar2)&&(await pg.locator('#remindBar .remind-row').count())===3&&(await pg.locator('#remindBar .remind-row.is-today').count())===2, `回撥提醒與今天到期合成一份清單（3 列）：${bar2.slice(0,120)}`);
 // 同一家既有回撥時間又今天到期 → 只列一次（有時間的那列）
 await pg.evaluate(async()=>{ await window.Store.setState({recordId:'1',remindAt:Date.now()+1800000,remindNote:'找王經理',remindSetAt:Date.now(),updatedAt:Date.now()}); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk((await pg.locator('#remindBar .remind-row').count())===3&&(await pg.locator('#remindBar .remind-row:has-text("今天甲")').count())===1&&/找王經理/.test(await pg.textContent('#remindBar .remind-row:has-text("今天甲")')), '同一家只列一次，用有時間的那列');
 chk((await pg.locator('#remindBar .remind-tel[href^="tel:"]').count())===3, '每列的電話可直接撥');
 // 固定展開，沒有收合鈕（版本 314：三天點了一百多次，等於每次都要先點開）
 chk((await pg.locator('#remindBar .remind-toggle').count())===0 && (await pg.locator('#remindBar .remind-row').count())===3, '沒有收合鈕，清單直接展開');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
