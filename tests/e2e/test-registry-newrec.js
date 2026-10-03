const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9092);
const row=(t,name,o)=>({Business_Accounting_NO:t,Company_Name:name,Company_Status:'01',Responsible_Name:'王',Company_Location:'新北市新莊區中正路1號',Capital_Stock_Amount:'5000000',Company_Setup_Date:'0990101',...o});
const REG={'12345678':row('12345678','查得到甲',{Capital_Stock_Amount:'9000000',Responsible_Name:'新老闆'})};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1100,height:1300}});
 await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/, (route)=>{ const u=decodeURIComponent(route.request().url()); const m=u.match(/Business_Accounting_NO eq (\d{8})/); const r=m?REG[m[1]]:null; route.fulfill({status:200,contentType:'application/json;charset=UTF-8',headers:{'access-control-allow-origin':'*'},body:r?JSON.stringify([r]):''}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9092/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto','1'); localStorage.setItem('registry-proxy-url','https://x.workers.dev/'); localStorage.setItem('registry-auto-last', new Date().toISOString().slice(0,10)); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 const addManual=async(name,tax)=>{ if(await pg.isVisible('#importer')) { await pg.click('#importer .drawer-close'); await pg.waitForTimeout(200); } await pg.click('#btnImport'); await pg.waitForTimeout(200); await pg.click('[data-act="new-customer"]'); await pg.waitForSelector('#editor h2');
  await pg.locator('#editor label.rule-field:has(span:text-is("公司名稱")) input').fill(name); await pg.locator('#editor label.rule-field:has(span:text-is("統一編號")) input').fill(tax);
  await pg.click('#editor button:has-text("新增")'); await pg.waitForTimeout(1500); };
 // 甲：查得到 → 新增後立刻查核、套用差異
 await addManual('查得到甲','12345678');
 await pg.waitForFunction(()=>/新客戶|已依商工登記/.test(document.querySelector('#toast')?.textContent||''),{timeout:15000}).catch(()=>{});
 await pg.waitForTimeout(500);
 let d=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/負責人\s*新老闆/.test(d)&&/資本總額\s*9,000 仟元/.test(d), `新增後立刻查核並套用登記資料：${d.match(/負責人.{0,12}/)?.[0]}｜${d.match(/資本總額.{0,16}/)?.[0]}`);
 chk(/變更登記\s*無變更|變更登記\s*(增資|其他)/.test(d)&&/最近查核/.test(d), `變更登記已查核：${d.match(/變更登記.{0,30}/)?.[0]}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 // 乙：查不到 → 記下原因，詳細頁分得出
 await addManual('查不到乙','87654321');
 await pg.waitForFunction(()=>/查不到/.test(document.querySelector('#toast')?.textContent||''),{timeout:15000}).catch(()=>{});
 await pg.waitForTimeout(500);
 d=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/變更登記\s*未查核：查不到/.test(d)&&/商工登記查不到這家/.test(d), `查不到的註明原因：${d.match(/變更登記.{0,40}/)?.[0]}`);
 const st=await pg.evaluate(async()=>(await window.Store.allStates()).map(s=>({id:s.recordId,regAt:!!s.regAt,err:s.regError||''})));
 chk(st.some(s=>s.regAt&&s.err)&&st.some(s=>s.regAt&&!s.err), `狀態：一筆查到、一筆記了查不到：${JSON.stringify(st)}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 const chips=await pg.evaluate(()=>[...document.querySelectorAll('#fltRegChange .chip')].map(c=>c.textContent.trim()));
 chk(chips.includes('1 未查核'), `篩選：查不到的仍算未查核：${chips}`);
 // 沒開自動更新就不查
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(400);
 await addManual('沒開自動丙','55556666'); await pg.waitForTimeout(1500);   // 統編要跟前面兩筆都不一樣，不然會被「同一家不重複新增」擋下來
 d=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/變更登記\s*未查核\s*還沒查過商工登記/.test(d), `沒開自動更新：未查核並說明原因：${d.match(/變更登記.{0,30}/)?.[0]}`);
 chk((await pg.locator('#filters [data-group="territory"]').count())===0, '服務區域篩選已拿掉');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
