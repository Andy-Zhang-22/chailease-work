const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9193);
const N=12;
const mk=(i)=>({id:String(i),source:'A.csv',company:`測試${i}公司`,aliases:[],taxId:String(10000000+i),grade:'',founded:'',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:'',display:'02-1111-1111',dial:'0211111111'}],owner:'舊負責人',keyman:'',industry:'',address:'新北市新莊區中正路1號',addressActual:'',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
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
 await pg.goto('http://localhost:9193/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-proxy-url','https://x.workers.dev/'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);

 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#autoRegistry');
 await pg.selectOption('#editorBody select', 'all');
 // 照實際流程：先試一筆通了，「全部更新」才會開啟
 await pg.click('#editorBody button:has-text("先試一筆")');
 await pg.waitForFunction(()=>!document.querySelector('#editorBody button:nth-of-type(1)') || !document.querySelector('#editorBody .card-actions button:has-text')||true,{timeout:5000}).catch(()=>{});
 await pg.waitForSelector('#editorBody button:has-text("全部更新"):not([disabled])',{timeout:15000});
 calls=0;
 await pg.click('#editorBody button:has-text("全部更新")');
 await pg.waitForSelector('#registryBar:not([hidden])',{timeout:10000});
 chk(await pg.$eval('#editor', e=>e.hidden), '按下去後設定視窗自動收起來');
 chk(/登記更新/.test(await pg.textContent('#registryBarTitle')), `底部出現進度：${await pg.textContent('#registryBarTitle')}`);

 // 跑的同時照常使用名單：打開一筆客戶的詳細頁
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(200);
 await pg.locator('.card .card-name').first().click();
 await pg.waitForSelector('#drawerBody h2',{timeout:5000});
 chk(true, '更新進行中仍可打開客戶詳細頁');
 await pg.click('#drawer .drawer-close');
 chk(!(await pg.$eval('#registryBar', e=>e.hidden)), '進度條還在，工作沒被打斷');

 // 一筆一筆寫入：還沒跑完就已經有資料存進去
 const mid = await pg.evaluate(async()=>{ const s=await window.Store.allStates(); return s.filter(x=>x.edits&&x.edits.owner==='新負責人').length; });
 const running = await pg.$eval('#registryBarTitle', e=>e.textContent);
 chk(mid>0 && /登記更新 \d+\/\d+/.test(running), `中途已寫入 ${mid} 筆（此時 ${running}）`);

 // 停止
 await pg.click('#btnRegistryStop');
 await pg.waitForFunction(()=>/已停止|完成/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:15000});
 const stoppedAt = calls;
 chk(/已停止/.test(await pg.textContent('#registryBarTitle')), `按停止就停下來：${await pg.textContent('#registryBarTitle')}`);
 await pg.waitForTimeout(1200);
 chk(calls===stoppedAt, `停止後不再送出查詢（${calls} 次）`);
 chk(calls<N, `沒有跑完全部 ${N} 筆就停了（送出 ${calls} 次）`);

 // 重新打開設定視窗會看到上次結果
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#autoRegistry');
 chk(/上次更新（中途停止）/.test(await pg.textContent('#editorBody')), '設定視窗顯示上次更新結果');
 await pg.click('#editor .drawer-close');

 // 關閉進度條
 await pg.click('#btnRegistryClose');
 chk(await pg.$eval('#registryBar', e=>e.hidden), '可以把完成後的進度條關掉');

 // 再跑一次：接著查剩下的，查過的不重查（使用者：「執行到一半就被我跳掉，有辦法讓系統接續查詢，不要再重工了嗎」）
 const checkedBefore = await pg.evaluate(async()=>{ const s=await window.Store.allStates(); return s.filter(x=>x.regAt).length; });
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#autoRegistry');
 await pg.selectOption('#editorBody select', 'all');
 const sum2 = await pg.textContent('#editorBody .registry-summary');
 chk(new RegExp(`上次查到一半：${checkedBefore} 筆已查過，按「全部更新」接著查剩下的 ${N-checkedBefore} 筆`).test(sum2) && await pg.locator('#registryFresh').isVisible(), `設定視窗說上次查到哪裡、可以勾從頭重查：${sum2.slice(-60)}`);
 await pg.click('#editorBody button:has-text("先試一筆")');
 await pg.waitForSelector('#editorBody button:has-text("全部更新"):not([disabled])',{timeout:15000});
 calls=0;
 await pg.click('#editorBody button:has-text("全部更新")');
 await pg.waitForSelector('#registryBar:not([hidden])');
 chk(new RegExp(`接著查剩下的 ${N-checkedBefore} 筆`).test(await asked(pg)), '確認框寫接著查剩下幾筆');
 await pg.waitForFunction(()=>/完成/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:30000});
 const done = await pg.evaluate(async()=>{ const s=await window.Store.allStates(); return s.filter(x=>x.edits&&x.edits.owner==='新負責人').length; });
 chk(done===N, `跑完全部 ${N} 筆都更新了：${done}`);
 chk(calls===N-checkedBefore, `只查剩下的 ${N-checkedBefore} 筆，查過的沒重查（送出 ${calls} 次）`);
 chk(!(await pg.evaluate(()=>localStorage.getItem('registry-round'))), '整輪跑完，下次從頭');
 chk(/更新 \d+/.test(await pg.textContent("#registryBarNote")), `完成後顯示結果：${await pg.textContent('#registryBarNote')}`);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
