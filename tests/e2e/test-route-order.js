// 拜訪路線排順路（使用者：「都做」）：行事曆一天的拜訪，有約時間的照時間在前；其他從上一站（沒有就從分公司）挑最近的；
// 用行政區中心點排（「📍 用地圖座標排」版本 329 拿掉了）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9581);
const TODAY='2026-10-05';
const mk=(id,company,addr,dist,city)=>({id,source:'A.csv',company,aliases:[],taxId:'',grade:'',founded:'2018',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:addr,city:city||'新北市',district:dist,notesRaw:'',timeline:[],outcome:'contacted',nextDate:'2026-10-07',lastDate:'2026-09-30',addedDate:'2026-09-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1100}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');}catch(e){}});
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 let geoCalls=0;
 await ctx.route('https://places.googleapis.com/**',r=>{ geoCalls++; const q=JSON.parse(r.request().postData()).textQuery;
   const loc=/中正路1號/.test(q)?{latitude:25.03,longitude:121.44}:/板橋/.test(q)?{latitude:25.01,longitude:121.46}:/中山/.test(q)?{latitude:25.07,longitude:121.54}:{latitude:25.06,longitude:121.49};
   r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({places:[{location:loc}]})}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9581/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 同一天四家：台北中山、三重、新莊、板橋（字母順序會是 三重→中山→新莊→板橋，順路應該是 新莊→板橋→三重→中山）
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); const now=Date.now(); let t=now-1e8;
   for (const r of recs) { await window.Store.addLog({recordId:r.id,date:'2026-09-30',text:'約拜訪',outcome:'contacted',meeting:true,meetingDate:'2026-10-07',createdAt:(t+=1000)});
     await window.Store.setState({recordId:r.id,outcome:'contacted',lastDate:'2026-09-30',nextDate:'2026-10-07',updatedAt:now}); }
 },[mk('1','台北中山有限公司','臺北市中山區南京東路2段1號','中山區','臺北市'),mk('2','三重有限公司','新北市三重區重新路1號','三重區'),mk('3','新莊有限公司','新北市新莊區中正路1號','新莊區'),mk('4','板橋有限公司','新北市板橋區文化路1號','板橋區')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 await pg.evaluate(()=>window.switchTab('cal')); await pg.waitForTimeout(300);
 await pg.click('#paneCal .cal-day[data-date="2026-10-07"]'); await pg.waitForTimeout(300);
 const order=async()=>pg.$$eval('#paneCal .cal-agenda .cal-row.is-visit .link-btn',a=>a.map(x=>x.textContent));
 const o1=await order();
 chk(JSON.stringify(o1)==='["新莊有限公司","板橋有限公司","三重有限公司","台北中山有限公司"]', `從新莊分公司出發挑最近的：${o1.join('→')}`);
 chk(/已排順路/.test(await pg.textContent('#paneCal .cal-route')), '寫明已排順路');
 // 有約時間的照時間在前，其他從那一站接著挑
 const o2=await pg.evaluate(()=>{ const v=(c,d,city)=>({company:c,address:`${city}${d}某路1號`,city,district:d});
   return window.routeOrder([{v:v('甲','新莊區','新北市'),time:''},{v:v('乙','中山區','臺北市'),time:'10:00'},{v:v('丙','三重區','新北市'),time:''},{v:v('丁','板橋區','新北市'),time:''},{v:{company:'戊',address:'',city:'',district:''},time:''}]); });
 chk(JSON.stringify(o2)==='["乙","丙","甲","丁","戊"]', `有約時間的先、再從那一站挑最近的、看不出區的最後：${o2.join('→')}`);
 // 「📍 用地圖座標排」版本 329 拿掉了：有金鑰也不出現
 await pg.evaluate(()=>localStorage.setItem('places-api-key','TESTKEY'));
 await pg.click('#paneCal .cal-day[data-date="2026-10-06"]'); await pg.click('#paneCal .cal-day[data-date="2026-10-07"]'); await pg.waitForTimeout(300);
 chk((await pg.locator('#paneCal .cal-geo').count())===0 && geoCalls===0, '沒有「用地圖座標排」、沒打 Google');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
