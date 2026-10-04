const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(8971);

const mk=(id,name,tax,addr,owner)=>({id,source:'名單.pdf',company:name,aliases:[],taxId:tax,grade:'A',
 founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],
 owner,keyman:'',industry:'營造業',address:addr,city:'',district:'',notesRaw:'',timeline:[],
 outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'});

// 甲：沒地址、負責人是舊的   乙：有地址、負責人也是舊的（補地址模式不該碰它）
const SEED=[mk('A1','甲工程有限公司','11111111','','王old'),
            mk('A2','乙精密股份有限公司','22222222','臺北市信義區松高路11號','李old')];
// 乙的四個欄位都有值，所以「只補空白」不該挑到它
const API={
 '11111111':[{Business_Accounting_NO:'11111111',Company_Name:'甲工程有限公司',Responsible_Name:'王新任',
   Company_Location:'新北市新莊區幸福東路79號4樓',Capital_Stock_Amount:'38000000'}],
 '22222222':[{Business_Accounting_NO:'22222222',Company_Name:'乙精密股份有限公司',Responsible_Name:'李新任',
   Company_Location:'臺北市信義區松高路99號',Capital_Stock_Amount:'88000000'}],
};
const grid=(pg)=>pg.evaluate(()=>{const o={};const dl=document.querySelector('#drawerBody dl');if(!dl)return o;
 const k=[...dl.children];for(let i=0;i<k.length;i+=2){if(k[i].tagName==='DT')o[k[i].textContent]=(k[i+1]||{}).textContent||'';}return o;});

(async()=>{
 let bad=0;
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1300}});
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 let lastDialog=''; pg.on('dialog',d=>{lastDialog=d.message();d.accept();});
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.route('**/data.gcis.nat.gov.tw/**',(r)=>r.abort('failed'));
 await pg.route('**/my-worker.test/**',(route)=>{
   let u=route.request().url(); try{u=decodeURIComponent(decodeURIComponent(u));}catch(e){}
   const m=u.match(/eq\s*(\d{8})/);
   route.fulfill({status:200,contentType:'application/json',body:JSON.stringify((m&&API[m[1]])||[])});
 });
 await pg.goto('http://localhost:8971/index.html');
 await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-auto','0'); await window.Store.saveRecords(r);},SEED);   // 自動更新關掉：它一跑起來「全部更新」就會先灰掉，跟這裡手動按的搶
 await pg.reload(); await pg.waitForTimeout(900);

 await pg.click('#btnMenu'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#editorBody h2');
 await pg.fill('#proxyUrl','https://my-worker.test/'); await pg.dispatchEvent('#proxyUrl','change');

 // 預設就是「只補未填地址」，摘要要說出筆數
 const sel=await pg.inputValue('#editorBody select');
 const ok0=sel==='blank';
 if(!ok0)bad++; console.log(`${ok0?'PASS':'FAIL'} 預設範圍是「只查欄位有空白的客戶」（得到 ${sel}）`);
 const sum=(await pg.textContent('#editorBody .registry-summary')).replace(/\s+/g,' ');
 const ok1=/1 筆有欄位是空的/.test(sum);
 if(!ok1)bad++; console.log(`${ok1?'PASS':'FAIL'} 摘要算出待補筆數：${sum.slice(0,90)}`);

 await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(1500);
 await pg.click('button:has-text("全部更新")'); await pg.waitForTimeout(3000);
 const okDlg=(await asked(pg)).some(m=>/會直接更新/.test(m))||/會直接更新/.test(lastDialog);
 if(!okDlg)bad++; console.log(`${okDlg?'PASS':'FAIL'} 確認訊息說明查到差異會直接更新`);

 const res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' ');
 const ok2=/查[完了] 1 筆/.test(res);
 if(!ok2)bad++; console.log(`${ok2?'PASS':'FAIL'} 只查了沒地址的那 1 筆：${res.slice(0,70)}`);
 const ok3=/王old.*王新任/.test(res)&&/已直接更新/.test(res)&&!(await pg.locator('button:has-text("填入這"), button:has-text("套用這")').count());
 if(!ok3)bad++; console.log(`${ok3?'PASS':'FAIL'} 差異清單列出負責人異動、說明已直接更新、沒有套用按鈕`);
 await pg.waitForTimeout(800); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(500);

 await pg.locator('.card:has-text("甲工程") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 const g1=await grid(pg);
 const ok4=(g1['登記地址']||'').includes('幸福東路79號4樓');
 const ok5=(g1['負責人']||'').trim()==='王新任';
 if(!ok4)bad++; console.log(`${ok4?'PASS':'FAIL'} 甲工程補上地址：${JSON.stringify(g1['登記地址']||'')}`);
 if(!ok5)bad++; console.log(`${ok5?'PASS':'FAIL'} 甲工程的負責人也依登記更新：${JSON.stringify(g1['負責人']||'')}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 await pg.locator('.card:has-text("乙精密") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 const g2=await grid(pg);
 const ok6=(g2['登記地址']||'').includes('松高路11號');
 const ok7=(g2['負責人']||'').trim()==='李old';
 if(!ok6)bad++; console.log(`${ok6?'PASS':'FAIL'} 乙精密原本就有的地址沒被覆蓋：${JSON.stringify(g2['登記地址']||'')}`);
 if(!ok7)bad++; console.log(`${ok7?'PASS':'FAIL'} 乙精密完全沒被碰到：${JSON.stringify(g2['負責人']||'')}`);

 console.log('ERRORS:', errs.length?errs:'none');
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
