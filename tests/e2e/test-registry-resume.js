// 商工登記接續查詢（使用者：「商工登記的查詢，都會執行到一半就被我跳掉，有辦法讓系統接續查詢，不要再重工了嗎」）：
// 今天的自動更新跑到一半網頁被關掉 → 重新打開接著查剩下的；查過的不重查；按過停止的同一天不自己接，隔天再接
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9624);
const N=8, DONE=5;
const mk=(i)=>({id:String(i),source:'A.csv',company:`測試${i}公司`,aliases:[],taxId:String(10000000+i),grade:'',founded:'',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'舊負責人',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=Array.from({length:N},(_,i)=>mk(i+1));
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); const hit=[];
 await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/, (route)=>{ const u=decodeURIComponent(route.request().url()); const m=u.match(/Business_Accounting_NO eq (\d{8})/); if(m) hit.push(m[1]);
   const row=m?{Business_Accounting_NO:m[1],Company_Name:'x',Company_Status:'01',Responsible_Name:'新負責人',Company_Location:'新北市新莊區中正路1號',Capital_Stock_Amount:'5000000',Company_Setup_Date:''}:null;
   route.fulfill({status:200,contentType:'application/json;charset=UTF-8',headers:{'access-control-allow-origin':'*'},body:row?JSON.stringify([row]):''}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9624/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 情境：今天的自動更新 1 小時前開跑，查完前 5 家網頁就被關掉（沒按停止）
 const setup=async(stopped)=>pg.evaluate(async({r,n,stopped})=>{
   await window.Store.saveRecords(r);
   const today=new Date(); const iso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
   const at=Date.now()-3600e3;
   for (let i=1;i<=r.length;i++) await window.Store.setState({ recordId:String(i), regAt: i<=n ? at+60e3 : 0, updatedAt: Date.now() });
   localStorage.setItem('registry-auto','1'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');
   localStorage.setItem('registry-proxy-url','https://x.workers.dev/');
   localStorage.setItem('registry-auto-last',iso);
   localStorage.setItem('registry-round',JSON.stringify({at,auto:true,...(stopped?{stopped:true}:{})}));
   localStorage.removeItem('registry-round-beat');
 },{r:SEED,n:DONE,stopped});
 await setup(false);
 hit.length=0;
 await pg.reload(); await pg.waitForSelector('#btnImport');
 await pg.waitForFunction(()=>/完成/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:20000}).catch(()=>{});
 const want=SEED.slice(DONE).map(r=>r.taxId);
 chk(hit.length===N-DONE && want.every(t=>hit.includes(t)), `重新打開接著查剩下的 ${N-DONE} 家，前面查過的不重查：${hit.length} 次`);
 const sum=await pg.evaluate(()=>localStorage.getItem('registry-auto-summary')||'');
 chk(/接續上次，前面 5 筆已查過/.test(sum), `摘要寫接續：${sum}`);
 chk(!(await pg.evaluate(()=>localStorage.getItem('registry-round'))), '這一輪查完就收掉');
 // 按過停止的：同一天不自己接（不跟使用者搶），等手動或隔天
 await setup(true);
 hit.length=0;
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(2500);
 chk(hit.length===0, `按過停止的同一天不自動接（送出 ${hit.length} 次）`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
