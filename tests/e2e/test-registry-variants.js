const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(8981);

const ROW={Business_Accounting_NO:'11111111',Company_Name:'甲工程有限公司',Responsible_Name:'王新任',
 Company_Location:'新北市新莊區幸福東路79號4樓',Capital_Stock_Amount:'38000000'};
const SEED=[{id:'V1',source:'名單.pdf',company:'甲工程有限公司',aliases:[],taxId:'11111111',grade:'A',
 founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],
 owner:'王old',keyman:'',industry:'營造業',address:'',city:'',district:'',notesRaw:'',timeline:[],
 outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'}];

(async()=>{
 let bad=0;
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1300}});
 pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.route('**/data.gcis.nat.gov.tw/**',(r)=>r.abort('failed'));

 // 代理：第一種寫法（統編專用資料集）回 HTML 錯誤頁，第二種（關鍵字資料集加 Company_Status）才給 JSON
 let mode='second-needed';
 await pg.route('**/my-worker.test/**',(route)=>{
   let u=route.request().url(); try{u=decodeURIComponent(decodeURIComponent(u));}catch(e){}
   if(mode==='empty') return route.fulfill({status:200,contentType:'text/html',body:''});
   const second=/Company_Status eq 01/.test(u);
   if(second) return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([ROW])});
   return route.fulfill({status:200,contentType:'text/html',body:'<html><body>Bad Request</body></html>'});
 });

 await pg.goto('http://localhost:8981/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0');localStorage.setItem('registry-auto','0');}catch(e){}});
 await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900);
 await pg.click('#btnMenu'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#editorBody h2');
 await pg.fill('#proxyUrl','https://my-worker.test/'); await pg.dispatchEvent('#proxyUrl','change');

 // 1. 第一種寫法失敗，第二種（加引號）要接上
 await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(2000);
 let res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 const ok1=/查詢成功/.test(res)&&/寫法 2/.test(res);
 if(!ok1)bad++; console.log(`${ok1?'PASS':'FAIL'} 第一種寫法不通時自動換第二種：${res.slice(0,80)}`);
 const ok2=/幸福東路79號4樓/.test(res);
 if(!ok2)bad++; console.log(`${ok2?'PASS':'FAIL'} 換過寫法後有查到地址`);

 // 2. 全部寫法都回空白時，要講出「空白回應」而不是只說不是 JSON
 mode='empty';
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 await pg.click('#btnMenu'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#editorBody h2');
 await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(2500);
 res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 const ok3=/空白回應/.test(res);
 if(!ok3)bad++; console.log(`${ok3?'PASS':'FAIL'} 空白回應有明講（不是只說「不是 JSON」）`);
 const ok4=/實際收到/.test(res)&&/text\/html/.test(res);
 if(!ok4)bad++; console.log(`${ok4?'PASS':'FAIL'} 有列出 Content-Type 與實際內容`);
 const ok5=/在新分頁打開這個查詢網址/.test(res)&&/data\.gcis\.nat\.gov\.tw/.test(res);
 if(!ok5)bad++; console.log(`${ok5?'PASS':'FAIL'} 有給可直接打開的政府網址`);
 console.log('   摘要:', res.slice(0,260));

 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
