const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(8991);

const SEED=[{id:'P1',source:'名單.pdf',company:'甲工程有限公司',aliases:[],taxId:'20232017',grade:'A',
 founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],
 owner:'王old',keyman:'',industry:'營造業',address:'',city:'',district:'',notesRaw:'',timeline:[],
 outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'}];

(async()=>{
 let bad=0;
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1400}});
 pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.route('**/data.gcis.nat.gov.tw/**',(r)=>r.abort('failed'));

 // 重現實測症狀：查這家→空白 JSON；探路查台積電→看 mode 決定
 let mode='dataset-ok';
 await pg.route('**/my-worker.test/**',(route)=>{
   let u=route.request().url(); try{u=decodeURIComponent(decodeURIComponent(u));}catch(e){}
   const probe=/22099131/.test(u);
   if(!probe) return route.fulfill({status:200,contentType:'application/json;charset=UTF-8',body:''});
   if(mode==='dataset-bad') return route.fulfill({status:200,contentType:'application/json;charset=UTF-8',body:''});
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
     {'統一編號':'20232017','公司名稱':'甲工程有限公司','公司所在地':'新北市新莊區幸福東路79號4樓','怪欄位XYZ':'1'}])});
 });

 const open=async()=>{ await pg.click('#btnMenu'); await pg.click('[data-act="registry"]');
   await pg.waitForSelector('#editorBody h2');
   await pg.fill('#proxyUrl','https://my-worker.test/'); await pg.dispatchEvent('#proxyUrl','change'); };

 await pg.goto('http://localhost:8991/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}});
 await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900);

 // 情境一：資料集是好的 → 應指出問題在查詢條件，並列出真正的欄位名稱
 await open();
 await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(3000);
 let res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 const ok1=/路是通的：查台積電查得到/.test(res);
 if(!ok1)bad++; console.log(`${ok1?'PASS':'FAIL'} 探路（台積電）查得到時，指出路是通的、只是這家查不到`);
 const ok2=/統一編號/.test(res)&&/怪欄位XYZ/.test(res);
 if(!ok2)bad++; console.log(`${ok2?'PASS':'FAIL'} 列出 API 真正的欄位名稱（含沒見過的）`);
 console.log('  ', res.slice(res.indexOf('路是通的'), res.indexOf('路是通的')+150));

 // 情境二：資料集也空的 → 應指出資料集編號錯了
 mode='dataset-bad';
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 await open();
 await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(3000);
 res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 const ok3=/連台積電都查不到/.test(res)&&/整條路不通/.test(res);
 if(!ok3)bad++; console.log(`${ok3?'PASS':'FAIL'} 連台積電都查不到時，指出整條路不通`);
 const ok4=/自架代理（寫法 1）：/.test(res)&&/在新分頁打開這個查詢網址/.test(res);
 if(!ok4)bad++; console.log(`${ok4?'PASS':'FAIL'} 附上診斷時實際試過的來源，並給可直接打開的政府網址`);

 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
