const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9088);
const mk=(id,name)=>({id,source:'A.csv',company:name,aliases:[],taxId:'',grade:'',founded:'2015',capital:'10,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',addressActual:'',city:'',district:'',notesRaw:'2026/09/01 電話中聊',timeline:[],outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1300}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9088/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},[mk('1','甲公司'),mk('2','乙公司')]);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 await pg.uncheck('#hideBlocked'); await pg.waitForTimeout(300);
 await pg.locator('.card:has-text("甲公司")').click(); await pg.waitForSelector('#drawerBody h2');
 // 其他結果沒填內容仍擋
 await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(300);
 chk(/請至少填寫內容或下次聯絡日/.test(await pg.textContent('#toast')), '已聯絡等結果沒填內容仍會擋');
 // 禁止推廣不用填
 await pg.selectOption('#drawerBody select','blocked'); await pg.click('#drawerBody button:has-text("儲存紀錄")'); await pg.waitForTimeout(900);
 chk(/已標記禁止推廣/.test(await pg.textContent('#toast')), `禁止推廣可直接儲存：${await pg.textContent('#toast')}`);
 chk(/禁止推廣 — 請勿撥打/.test(await pg.textContent('#drawerBody')), '詳細頁出現禁止推廣警告');
 chk(/（禁止推廣）/.test((await pg.textContent('#drawerBody .timeline')).replace(/\s+/g,' ')), '時間軸有一則（禁止推廣）');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 chk(/禁止推廣/.test(await pg.textContent('.card:has-text("甲公司") .badge-blocked').catch(()=>'')), '卡片標禁止推廣');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
