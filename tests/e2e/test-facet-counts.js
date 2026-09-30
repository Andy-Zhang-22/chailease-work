const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9089);
const mk=(id,name,o)=>({id,source:'A.csv',company:name,aliases:[],taxId:'11111111',grade:'',founded:'2015',capital:'10,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',addressActual:'',city:'',district:'',notesRaw:'2026/09/01 電話中聊',timeline:[],outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01',...o});
const SEED=[
 mk('1','新莊有電話甲'), mk('2','新莊有電話乙'),
 mk('3','新莊無電話丙',{phoneRaw:'',phones:[]}),
 mk('4','台北無電話丁',{phoneRaw:'',phones:[],address:'臺北市大安區信義路1號',taxId:''}),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1200,height:1400}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9089/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(400);
 const chip=async(host,label)=>pg.evaluate(([h,l])=>{const c=[...document.querySelectorAll(`${h} .chip`)].find(x=>x.textContent.trim().endsWith(l)); return c?Number(c.querySelector('small').textContent):null;},[host,label]);
 chk(await chip('#fltPhone','有電話')===2&&await chip('#fltPhone','無電話')===2&&await chip('#fltCity','新北市')===3&&await chip('#fltTax','有統編')===3, '一開始是總數');
 await pg.locator('#fltPhone .chip').filter({hasText:/無電話$/}).click(); await pg.waitForTimeout(300);
 chk(/顯示 2 \/ 2 筆/.test(await pg.textContent('#listSummary')), '只看無電話：2 筆');
 chk(await chip('#fltPhone','有電話')===2&&await chip('#fltPhone','無電話')===2, '自己這組的數字不變（有電話仍是 2，才能換著看）');
 chk(await chip('#fltCity','新北市')===1&&await chip('#fltCity','臺北市')===1&&await chip('#fltTax','有統編')===1&&await chip('#fltTax','無統編')===1, `其他組的數字跟著變成無電話那 2 筆的分布：新北 ${await chip('#fltCity','新北市')}、臺北 ${await chip('#fltCity','臺北市')}、有統編 ${await chip('#fltTax','有統編')}`);
 const opt=await pg.evaluate(()=>[...document.querySelectorAll('#fltBranch option')].map(o=>o.textContent).join('|'));
 chk(/新莊分公司（1）/.test(opt)&&/城中分公司（1）/.test(opt), `歸屬分公司下拉的數字也連動：${opt}`);
 // 再加一個條件：優先區域 → 完整度那組的數字看的是「其他條件」
 await pg.locator('#fltCity .chip').filter({hasText:/新北市$/}).click(); await pg.waitForTimeout(300);
 chk(/顯示 1 \/ 1 筆/.test(await pg.textContent('#listSummary'))&&await chip('#fltPhone','有電話')===2&&await chip('#fltPhone','無電話')===1, `疊加新北市後：有電話 ${await chip('#fltPhone','有電話')}（新北市裡有 2 家有電話）、無電話 ${await chip('#fltPhone','無電話')}`);
 // 搜尋也算進去
 await pg.fill('#search','丙'); await pg.waitForTimeout(500);
 chk(await chip('#fltPhone','有電話')===0&&await chip('#fltPhone','無電話')===1, `搜尋「丙」後：有電話 ${await chip('#fltPhone','有電話')}、無電話 ${await chip('#fltPhone','無電話')}`);
 await pg.fill('#search',''); await pg.waitForTimeout(400); await pg.click('#btnResetFilters'); await pg.waitForTimeout(300);
 chk(await chip('#fltPhone','有電話')===2&&await chip('#fltCity','新北市')===3, '清除後回到總數');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
