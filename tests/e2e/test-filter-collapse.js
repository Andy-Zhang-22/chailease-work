const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9081);
const mk=(id,name)=>({id,source:'A.csv',company:name,aliases:[],taxId:'',grade:'',founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',addressActual:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'2026/09/01 電話中聊',timeline:[],outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 // 手機寬度
 const pg=await br.newPage({viewport:{width:390,height:844}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9081/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},[mk('1','甲'),mk('2','乙')]);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.click('#btnFilters'); await pg.waitForTimeout(300);
 const state=async()=>pg.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#filters .filter-group[data-group]')].map(g=>[g.dataset.group,!g.classList.contains('is-closed')])));
 let st=await state();
 chk(st.due&&st.outcome&&st.branch&&st.sort&&!st.city&&!st.added&&!st.scale&&!st.territory&&!st.relation&&!st.visit&&!st.tax&&!st.regchange&&!st.industry&&!st.source, `手機預設只展開四組：${JSON.stringify(st)}`);
 chk(!(await pg.locator('#fltCity .chip').first().isVisible()), '收起的組別內容看不到');
 await pg.click('#filters [data-group="city"] > label'); await pg.waitForTimeout(200);
 chk(await pg.locator('#fltCity .chip').first().isVisible(), '點標題展開縣市');
 await pg.locator('#fltCity .chip').first().click(); await pg.waitForTimeout(300);
 await pg.click('#filters [data-group="city"] > label'); await pg.waitForTimeout(200);
 chk(await pg.textContent('#filters [data-group="city"] .filter-count')==='1', '收起後標題仍顯示已選 1');
 await pg.click('#filters [data-group="tax"] > label'); await pg.waitForTimeout(200);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.click('#btnFilters'); await pg.waitForTimeout(300);
 st=await state();
 chk(!st.city&&st.tax, `收合狀態記住（縣市收起、統編展開）：city=${st.city} tax=${st.tax}`);
 // 電腦寬度預設全開
 const pc=await br.newPage({viewport:{width:1200,height:900}});
 await pc.goto('http://localhost:9081/index.html'); await pc.waitForSelector('#dropzone'); await pc.click('#importer .drawer-close'); await pc.waitForTimeout(300);
 const all=await pc.evaluate(()=>[...document.querySelectorAll('#filters .filter-group[data-group]')].every(g=>!g.classList.contains('is-closed')));
 chk(all, '電腦版預設全部展開');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
