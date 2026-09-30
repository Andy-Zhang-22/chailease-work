// 二分法那幾組改單選；縣市、規模、變更登記這種疊起來有意義的維持複選
const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9201);
const mk=(i,name,city,cap,tax)=>({id:String(i),source:'A.csv',company:name,aliases:[],taxId:tax,grade:'',founded:'2015',capital:cap,phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:city==='臺北市'?'臺北市大安區信義路1號':'新北市新莊區中正路1號',city:'',district:'',notesRaw:'2026/08/01 本餘 300 萬在和潤',timeline:[{date:'2026-08-01',text:'本餘 300 萬在和潤'}],outcome:'contacted',nextDate:'',lastDate:'2026-08-01',addedDate:'2026-09-01'});
const SEED=[mk(1,'甲公司','臺北市','3,000','11111111'),mk(2,'乙公司','新北市','12,000','22222222'),mk(3,'丙公司','新北市','800,000','')];
// 丙沒有本餘：往來情形那組才會兩顆都出現（家數 0 的不畫）
SEED[2].notesRaw='2026/08/01 還沒談到額度'; SEED[2].timeline=[{date:'2026-08-01',text:'還沒談到額度'}];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1280,height:1000}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9201/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 const picked=(host)=>pg.evaluate((h)=>[...document.querySelectorAll(`${h} .chip[aria-pressed="true"]`)].map(c=>c.textContent.trim()),host);
 const names=async()=>pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent).sort());

 // 單選那幾組：按第二顆就換過去
 for (const [host,a,b] of [['#fltTax','有統編','無統編'],['#fltPhone','有電話','無電話'],
                           ['#fltVisit','有拜訪','無拜訪'],['#fltRelation','active','none'],
                           ['#fltChance','有機會','無機會']]) {
   const pick=(t)=>(/^[a-z]+$/.test(t) ? pg.locator(`${host} .chip[data-value="${t}"]`) : pg.locator(`${host} .chip:has-text("${t}")`));
   await pick(a).click(); await pg.waitForTimeout(250);
   await pick(b).click(); await pg.waitForTimeout(250);
   const p=await picked(host);
   chk(p.length===1, `${host} 單選：只亮一顆（${JSON.stringify(p)}）`);
   await pick(b).click(); await pg.waitForTimeout(250);
   chk((await picked(host)).length===0, `${host} 再按同一顆＝取消`);
 }

 // 複選那幾組維持原樣：縣市可以同時選台北＋新北
 await pg.locator('#fltCity .chip:has-text("臺北市")').click(); await pg.waitForTimeout(250);
 await pg.locator('#fltCity .chip:has-text("新北市")').click(); await pg.waitForTimeout(250);
 chk((await picked('#fltCity')).length===2, `縣市維持複選：${JSON.stringify(await picked('#fltCity'))}`);
 chk((await names()).length===3, '兩個縣市是聯集，三筆都在');
 await pg.click('#btnResetFilters'); await pg.waitForTimeout(400);

 // 客戶規模也維持複選：微企＋一般組
 await pg.locator('#fltScale .chip:has-text("微企範疇")').click(); await pg.waitForTimeout(250);
 await pg.locator('#fltScale .chip:has-text("一般組範疇")').click(); await pg.waitForTimeout(250);
 chk((await picked('#fltScale')).length===2, `客戶規模維持複選：${JSON.stringify(await picked('#fltScale'))}`);
 chk(JSON.stringify(await names())===JSON.stringify(['乙公司','甲公司']), `微企＋一般組是聯集：${JSON.stringify(await names())}`);

 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
