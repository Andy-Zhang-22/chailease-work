// 統計頁：新名單成效（來源漏斗）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.csv':'text/csv'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9494);
const mk=(id,company,source,notesRaw)=>({id,source,company,aliases:[],taxId:'',grade:'',founded:'2015',capital:'3,000',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw,timeline:[],outcome:'new',nextDate:'2026-10-05',lastDate:'',addedDate:'2026-09-01',importedAt:1});
const RECS=[
 mk('c1','動保一有限公司','每日新名單-2026-09-29.csv','動保：和潤（動產抵押）擔保 193 萬\n每日新名單，符合：成立 5 年內、3 個月內到期'),
 mk('c2','動保二有限公司','每日新名單-2026-09-29.csv','動保：裕融（附條件買賣）擔保 50 萬\n每日新名單，符合：成立 5 年內'),
 mk('c3','動保三有限公司','動產擔保名單-2026-09-20-3家.csv','動保：中租（附條件）'),
 mk('c4','動保四有限公司','每日新名單-2026-09-30.csv','動保：和潤\n每日新名單，符合：成立 5 年內'),
 mk('l1','清冊一有限公司','每日新名單-2026-09-29.csv','新公司清冊 115/8 變更：增資\n每日新名單，符合：本期、增資'),
 mk('l2','清冊二有限公司','登記清冊-11508-2家.csv','新公司清冊 115/8 變更：增資'),
 mk('b1','商行一企業社','每日新名單-2026-09-29.csv','商行／企業社（稅籍登記）：獨資\n每日新名單，符合：有商業登記、我的分公司'),
 mk('x1','主力客戶有限公司','A名單.csv','2026/09/01 談過'),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1100,height:1000}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('http://localhost:9494/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('registry-auto','0');
   const now=Date.now();
   await window.Store.setState({recordId:'c1',outcome:'contacted',chance:'yes',chanceAt:now,lastDate:'2026-09-29'});
   await window.Store.setState({recordId:'c2',outcome:'noanswer',lastDate:'2026-09-29'});
   await window.Store.setState({recordId:'c3',outcome:'contacted',lastDate:'2026-09-29'});
   await window.Store.setState({recordId:'c4',outcome:'blocked',lastDate:'2026-09-30'});
   await window.Store.setState({recordId:'l1',outcome:'contacted',chance:'yes',chanceAt:now,lastDate:'2026-09-29'});
 },RECS);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1000);
 const f=await pg.evaluate(()=>window.funnelStats());
 chk(JSON.stringify(f.byOrigin['動產擔保'])===JSON.stringify({n:4,called:4,reached:2,chance:1,blocked:1}), `動產擔保：${JSON.stringify(f.byOrigin['動產擔保'])}`);
 chk(JSON.stringify(f.byOrigin['登記清冊'])===JSON.stringify({n:2,called:1,reached:1,chance:1,blocked:0}), `登記清冊：${JSON.stringify(f.byOrigin['登記清冊'])}`);
 chk(f.byOrigin['商行／企業社'].n===1 && f.byOrigin['商行／企業社'].called===0, `商行：${JSON.stringify(f.byOrigin['商行／企業社'])}`);
 chk(f.byRule['動產擔保｜成立 5 年內'].n===3 && f.byRule['動產擔保｜成立 5 年內'].called===3 && f.byRule['登記清冊｜增資'].chance===1, `依條件：${JSON.stringify(f.byRule)}`);
 await pg.click('.tab[data-tab="stats"]'); await pg.waitForTimeout(500);
 const txt=(await pg.innerText('#paneStats .funnel')).replace(/\s+/g,' ');
 chk(/新名單成效/.test(txt) && /動產擔保 4 4（100%） 50% 25% 1/.test(txt) && /登記清冊 2 1（50%） 100% 100% 0/.test(txt), `統計頁表格：${txt.slice(0,260)}`);
 chk(/動產擔保・成立 5 年內/.test(txt), '打過 3 家以上的條件有列出來');
 chk(!/主力客戶/.test(txt), '主力名單不算');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'全部通過');
 await br.close(); srv.close();
})();
