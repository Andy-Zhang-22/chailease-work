// 排序多一個「依最近核准變更（新到舊）」，而且排序那組搬到「名單新增」下面
const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9202);
const mk=(i,name,changed)=>({id:String(i),source:'A.csv',company:name,aliases:[],taxId:String(10000000+i),grade:'',founded:'2015',capital:'12,000',capitalPaid:'24,000',regChanged:changed,phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=[mk(1,'甲公司','2024/01/05'),mk(2,'乙公司','2026/04/02'),mk(3,'丙公司',''),mk(4,'丁公司','2025/11/30')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1280,height:1000}}); const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9202/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);

 const opts=await pg.evaluate(()=>[...document.querySelectorAll('#sortBy option')].map(o=>[o.value,o.textContent]));
 chk(opts.some(([v,t])=>v==='regchanged'&&/最近核准變更（新到舊）/.test(t)), `排序多一個選項：${JSON.stringify(opts.map(o=>o[1]))}`);

 const groups=await pg.evaluate(()=>[...document.querySelectorAll('#filters .filter-group[data-group]')].map(g=>g.dataset.group));
 chk(groups[groups.indexOf('added')+1]==='sort', `排序就在「名單新增」下面：${JSON.stringify(groups.slice(0,4))}`);

 // 預設就是這個排序，不用自己選
 const def=await pg.inputValue('#sortBy');
 chk(def==='regchanged', `預設排序就是最近核准變更：${def}`);
 const names=await pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent));
 chk(JSON.stringify(names)===JSON.stringify(['乙公司','丁公司','甲公司','丙公司']),
   `由新到舊排，沒有日期的排最後：${JSON.stringify(names)}`);

 // 換別的排序再換回來，確定沒壞
 await pg.selectOption('#sortBy','company'); await pg.waitForTimeout(400);
 await pg.selectOption('#sortBy','regchanged'); await pg.waitForTimeout(400);
 const again=await pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent));
 chk(again[0]==='乙公司', `切來切去還是對的：${JSON.stringify(again)}`);

 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
