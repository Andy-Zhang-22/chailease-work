// 每日新名單自動找電話（Google Places，假的回應）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.csv':'text/csv'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9495);
const SRC='每日新名單-2026-09-30.csv';
const mk=(id,company,address,phoneRaw='')=>({id,source:SRC,company,aliases:[],taxId:'',grade:'',founded:'2015',capital:'3,000',phoneRaw,phones:phoneRaw?[{digits:phoneRaw.replace(/\D/g,''),ext:'',note:''}]:[],owner:'',keyman:'',industry:'',address,city:'新北市',district:'新莊區',notesRaw:'動保：和潤',timeline:[],outcome:'new',nextDate:'2026-09-30',lastDate:'',addedDate:'2026-09-30',importedAt:1});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const asked=[];
 await ctx.route('https://places.googleapis.com/**',async (r)=>{ const q=JSON.parse(r.request().postData()).textQuery; asked.push(q);
   const places = /甲一/.test(q) ? [{id:'p1',displayName:{text:'甲一精密有限公司'},formattedAddress:'242新北市新莊區中正路1號',nationalPhoneNumber:'02 2990 1111'}]
     : /乙二/.test(q) ? [{id:'p2',displayName:{text:'隔壁小吃店'},formattedAddress:'台北市大安區xx路',nationalPhoneNumber:'02 2700 0000'}] : [];
   r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({places})}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('http://localhost:9495/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('registry-auto','0'); },
   [mk('1','甲一精密有限公司','新北市新莊區中正路1號'),mk('2','乙二機械有限公司','新北市新莊區中正路2號'),mk('3','丙三工程有限公司','新北市新莊區中正路3號','02-2222-3333')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const none=await pg.evaluate((s)=>window.autoPhones(s),SRC);
 chk(none.tried===0 && asked.length===0, '沒設金鑰就不查');
 await pg.evaluate(()=>localStorage.setItem('places-api-key','test-key'));
 const got=await pg.evaluate((s)=>window.autoPhones(s),SRC);
 chk(got.tried===2 && got.found===1, `兩家沒電話、找到一家：${JSON.stringify(got)}`);
 chk(asked.length===2 && !asked.some(q=>/丙三/.test(q)), `有電話的不查：${asked.join(' | ')}`);
 const ph=await pg.evaluate(()=>Object.fromEntries(window.customerViews().map(v=>[v.company,(v.phones[0]||{}).dial||''])));
 chk(ph['甲一精密有限公司']==='0229901111', `名稱、地址都對得上才填：${JSON.stringify(ph)}`);
 chk(ph['乙二機械有限公司']==='', '對不上的（隔壁店）不填');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'全部通過');
 await br.close(); srv.close();
})();
