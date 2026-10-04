const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9031);

const ROW={Business_Accounting_NO:'11111111',Company_Name:'甲工程有限公司',Responsible_Name:'王新任',
 Company_Location:'新北市新莊區幸福東路79號4樓',Capital_Stock_Amount:'38000000'};
const SEED=[{id:'D1',source:'名單.pdf',company:'甲工程有限公司',aliases:[],taxId:'11111111',grade:'A',
 founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],
 owner:'王old',keyman:'',industry:'',address:'',city:'',district:'',notesRaw:'',timeline:[],
 outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'}];

(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1400}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 // 其他沒特別指定的政府資料集一律回空（先註冊，下面指定的會蓋過它）：以前沒擋的那幾支會真的連到政府網站，
 // CI 上偶爾慢，2.5 秒內等不到結果就失敗（這支測試在 CI 偶發失敗的原因）
 await pg.route('**/data.gcis.nat.gov.tw/**',(r)=>r.fulfill({status:200,contentType:'application/json;charset=UTF-8',body:''}));
 await pg.route('**/company.g0v.ronny.tw/**',(r)=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
 // 內建的兩個資料集：一律回空的 JSON，重現「政府換了編號」的症狀
 await pg.route('**/data.gcis.nat.gov.tw/od/data/api/5F64D864**',(r)=>
   r.fulfill({status:200,contentType:'application/json;charset=UTF-8',body:''}));
 await pg.route('**/data.gcis.nat.gov.tw/od/data/api/236EE382**',(r)=>
   r.fulfill({status:200,contentType:'application/json;charset=UTF-8',body:''}));
 // 新的（對的）資料集
 await pg.route('**/data.gcis.nat.gov.tw/od/data/api/CORRECT-ID**',(r)=>
   r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([ROW])}));

 await pg.goto('http://localhost:9031/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}});
 await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900);
 await pg.click('#btnMenu'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#editorBody h2');

 const urls=pg.locator('#editorBody input[type="url"]');
 chk(await urls.count()===3, `有三個網址欄位（名稱資料集、統編資料集、代理），得到 ${await urls.count()}`);
 chk(/5F64D864/.test(await pg.locator('#datasetUrl').getAttribute('placeholder')||'')&&/7E6AFA72/.test(await pg.locator('#datasetTaxUrl').getAttribute('placeholder')||''), '兩個資料集欄位的提示文字是內建的那組');

 // 內建的都回空 → 連台積電都查不到 → 指出整條路不通
 await pg.click('button:has-text("先試一筆")');
 await pg.waitForFunction(()=>{const e=document.querySelector('#editorBody .rule-result:not(.proxy-diag)');return e&&/連台積電都查不到|路是通的/.test(e.textContent);},null,{timeout:20000}).catch(()=>{});
 let res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 chk(/連台積電都查不到/.test(res), `內建的都回空時，指出整條路不通：${res.slice(0,300)}`);

 // 填入新的統編資料集網址 → 應該查得到（這家有統編，走統編資料集）
 await pg.locator('#datasetTaxUrl').fill('https://data.gcis.nat.gov.tw/od/data/api/CORRECT-ID?$format=json&$top=1');
 await pg.dispatchEvent('#datasetTaxUrl','change');
 // 第一次的結果把面板撐長，Playwright 的座標點擊會落空；直接派事件
 await pg.locator('#editorBody button', {hasText:'先試一筆'}).dispatchEvent('click');
 await pg.waitForFunction(()=>{const e=document.querySelector('#editorBody .rule-result:not(.proxy-diag)');return e&&/查詢成功/.test(e.textContent);},null,{timeout:20000}).catch(()=>{});
 res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 chk(/查詢成功/.test(res), '換成正確的資料集網址後查得到');
 chk(/幸福東路79號4樓/.test(res), '查回來的地址正確');

 // 貼進來時後面的查詢參數要被去掉
 const stored=await pg.evaluate(()=>window.Registry.getTaxIdBase());
 chk(stored==='https://data.gcis.nat.gov.tw/od/data/api/CORRECT-ID', `存起來的網址去掉了查詢參數：${stored}`);

 // 重新載入後要記得
 await pg.reload(); await pg.waitForTimeout(900);
 const after=await pg.evaluate(()=>window.Registry.getTaxIdBase());
 chk(after===stored, '重新載入後仍記得');

 console.log('ERRORS:', errs.length?errs:'none');
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
