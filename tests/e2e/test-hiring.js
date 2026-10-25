// 104 徵才（版本 387）：Mac 在使用者的 Chrome 查好的職缺數寫在同步檔設定 hiring-results，網站套用：有徵才的從候選池加進今天的名單、
// 卡片標「104 徵才 N 件」、今天要打排前面；沒徵才的不加；同一家不重複加；一天最多 5 家
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9616);
const TODAY='2026-10-27';   // 週二
const HEAD=['公司名稱','統編','分級','成立','資本額','電話','負責人','KEYMAN','產業別','下次聯絡日','最近聯絡日','訪談內容','地址','名單新增日期','國家'].join(',');
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;   // 跟各頁 toStandardCsv 一樣：有逗號的欄位要加引號
const row=(name,tax,tel)=>[name,tax,'','2019','12,000',tel,'','','金屬製品製造業','__DAY__','','每日新名單，符合：剛登記工廠','新北市新莊區中正路1號',TODAY,''].map(q).join(',');
const mk=(i)=>({id:`r${i}`,source:'A.csv',company:`主力${i}有限公司`,aliases:[],taxId:String(20000000+i),grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-10-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9616/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({recs,head,rows})=>{ await window.Store.saveRecords(recs); ['registry-auto','daily-feed-auto','leads-hunt','auto-rebalance'].forEach(k=>localStorage.setItem(k,'0'));
   await window.Store.setSetting('hiring-candidates', JSON.stringify({day:'2026-10-27',at:Date.now(),head,list:[
     {key:'20000011',name:'甲一精密有限公司',src:'新設工廠',row:rows[0]},
     {key:'20000012',name:'乙二機械股份有限公司',src:'登記清冊',row:rows[1]},
     {key:'20000013',name:'丙三工程有限公司',src:'登記清冊',row:rows[2]},
     {key:'20000001',name:'主力1有限公司',src:'登記清冊',row:rows[3]}]}));
   await window.Store.setSetting('hiring-results', JSON.stringify({at:Date.now(),list:[
     {key:'20000011',count:3,at:Date.now()},{key:'20000012',count:0,at:Date.now()},{key:'20000013',count:1,at:Date.now()},{key:'20000001',count:9,at:Date.now()}]}));
 },{recs:[1,2].map(mk),head:HEAD,rows:[row('甲一精密有限公司','20000011','02-2222-3333'),row('乙二機械股份有限公司','20000012','0933-111-222'),row('丙三工程有限公司','20000013','02-2222-3333'),row('主力1有限公司','20000001','02-2222-3333')]});
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 const r1=await pg.evaluate(()=>window.applyHiring()); await pg.waitForTimeout(800);
 chk(r1.added===2 && /^每日新名單-2026-10-27-104\.csv$/.test(r1.name), `有徵才的 2 家加進來（0 件的不加、已在名單的不重複）：${JSON.stringify(r1)}`);
 const recs=await pg.evaluate(()=>[...document.querySelectorAll('#cards .card')].map(c=>({name:c.querySelector('.card-name').textContent.trim(),badges:[...c.querySelectorAll('.badge')].map(b=>b.textContent.trim())})));
 const jia=recs.find(r=>r.name==='甲一精密有限公司'), yi=recs.find(r=>r.name==='乙二機械股份有限公司');
 chk(jia && jia.badges.includes('104 徵才 3 件') && !yi, `甲一在名單上標 104 徵才 3 件、乙二（0 件）沒加：${JSON.stringify(recs.map(r=>r.name))}`);
 const rows=await pg.$$eval('#remindBar .remind-row .remind-name',a=>a.map(x=>x.textContent.trim()));
 chk(rows.length===4 && rows[0]==='甲一精密有限公司' && rows[1]==='丙三工程有限公司', `今天要打：104 有徵才的排最前、職缺多的先：${rows.join('|')}`);
 const r2=await pg.evaluate(()=>window.applyHiring());
 chk(r2.added===0, `再套一次不會重複加：${JSON.stringify(r2)}`);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
