// 跨過 0:00 時，網站開著就自己開始更新（不必重新整理）
const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9195);
const N=3;
const mk=(i)=>({id:String(i),source:'A.csv',company:`測試${i}公司`,aliases:[],taxId:String(10000000+i),grade:'',founded:'',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'舊負責人',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=Array.from({length:N},(_,i)=>mk(i+1));
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); let calls=0;
 await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/, (route)=>{ calls++; const u=decodeURIComponent(route.request().url()); const m=u.match(/Business_Accounting_NO eq (\d{8})/);
   const row=m?{Business_Accounting_NO:m[1],Company_Name:'x',Company_Status:'01',Responsible_Name:'新負責人',Company_Location:'新北市新莊區中正路1號',Capital_Stock_Amount:'5000000',Company_Setup_Date:''}:null;
   route.fulfill({status:200,contentType:'application/json;charset=UTF-8',headers:{'access-control-allow-origin':'*'},body:row?JSON.stringify([row]):''}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 // 停在 23:59:30，等一下讓時鐘自己走過午夜
 await pg.clock.install({ time: new Date('2026-09-19T23:59:30') });
 await pg.clock.resume();   // 假時鐘照真實速度走，網站內部的 0.3 秒間隔才不會卡住
 const jump=async(d)=>{ await pg.clock.fastForward(d); await pg.clock.resume(); };
 await pg.goto('http://localhost:9195/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','1'); localStorage.setItem('registry-proxy-url','https://x.workers.dev/'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport');
 await pg.waitForFunction(()=>localStorage.getItem('registry-auto-last')==='2026-09-19',{timeout:20000});
 await pg.waitForFunction(()=>/商工登記更新/.test(document.querySelector('#toast')?.textContent||''),{timeout:20000});
 const day1=calls;
 chk(day1===N, `19 號開站先跑一次（查了 ${day1} 筆）`);

 // 整晚不關網站，時間走過 0:00
 calls=0;
 await jump('02:00');   // 23:59:30 → 隔天 01:59:30
 const day2 = await pg.waitForFunction(()=>localStorage.getItem('registry-auto-last')==='2026-09-20',{timeout:20000}).then(()=>true,()=>false);
 chk(day2, '跨過 0:00 自己開跑，不用重新整理');
 await pg.waitForFunction((n)=>{ const t=document.querySelector('#registryBarTitle'); return t && /登記更新/.test(t.textContent); },N,{timeout:10000});
 await pg.waitForFunction(()=>/完成|已停止/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:20000});
 chk(calls===N, `0:00 那輪把 ${N} 筆都查了（送出 ${calls} 次）`);
 const sum=await pg.evaluate(()=>localStorage.getItem('registry-auto-last')+'|'+localStorage.getItem('registry-auto-summary'));
 chk(/^2026-09-20\|查 3 筆/.test(sum), `記成 20 號那天的自動更新：${sum}`);

 // 同一天之內不會再跑第二次
 calls=0;
 await jump('03:00');
 await pg.waitForTimeout(800);
 chk(calls===0, `同一天內不重複跑（送出 ${calls} 次）`);

 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
