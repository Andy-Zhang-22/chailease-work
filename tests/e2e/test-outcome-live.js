// 已經在名單上、匯入時被存成「已聯絡」的客戶，最上面那則沒日期 → 現在要顯示未撥打
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9058);
const SEED=[{id:'R1',source:'A.csv',company:'貝邦有限公司',aliases:[],taxId:'11111111',grade:'B',founded:'2015',capital:'10,000',
 phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市板橋區大觀路3段236號',city:'新北市',district:'板橋區',
 notesRaw:'19752183\n0023-42\n15',timeline:[{date:null,text:'19752183\n0023-42\n15'}],
 outcome:'contacted',   // 舊版匯入時存下來的
 nextDate:'',lastDate:'',addedDate:'2026-09-01'}];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1200}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('http://localhost:9058/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(500);
 const badge=await pg.textContent('.card .badge-outcome').catch(()=>'');
 const cardText=(await pg.textContent('.card')).replace(/\s+/g,' ');
 chk(/未撥打/.test(cardText)&&!/已聯絡/.test(cardText), `舊資料存的是已聯絡，現在卡片顯示未撥打：${cardText.slice(0,80)}`);
 const chips=await pg.evaluate(()=>[...document.querySelectorAll('#fltOutcome .chip')].map(c=>c.textContent.trim()));
 chk(chips.some(c=>/^1 未撥打/.test(c)), `洽談狀態篩選也是未撥打：${chips}`);
 // 使用者自己記的結果仍優先
 await pg.click('.card .card-name'); await pg.waitForSelector('#drawerBody h2');
 await pg.fill('#drawerBody textarea','打過了，老闆說再看看'); await pg.selectOption('#drawerBody select','contacted');
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(1000); await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
 chk(/已聯絡/.test((await pg.textContent('.card')).replace(/\s+/g,' ')), '自己記了通話後顯示自己選的結果');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
