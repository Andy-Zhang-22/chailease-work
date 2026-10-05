const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9069);
const mk=(id,name,tax,owner)=>({id,source:'A.csv',company:name,aliases:[],taxId:tax,grade:'',founded:'',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner,keyman:'',industry:'',address:'',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=[mk('1','甲公司','11111111','舊負責人'),mk('2','乙公司','22222222','李'),mk('3','丙公司','','王')];
// 假的政府 API：依統編或名稱回一筆
const REG={ '11111111':{Business_Accounting_NO:'11111111',Company_Name:'甲公司',Company_Status:'01',Responsible_Name:'新負責人',Company_Location:'新北市新莊區中正路1號',Capital_Stock_Amount:'8000000',Company_Setup_Date:'1050301'},
            '22222222':{Business_Accounting_NO:'22222222',Company_Name:'乙公司',Company_Status:'01',Responsible_Name:'李',Company_Location:'',Capital_Stock_Amount:'5000000',Company_Setup_Date:''},
            '丙公司':{Business_Accounting_NO:'33333333',Company_Name:'丙公司',Company_Status:'01',Responsible_Name:'王',Company_Location:'臺北市大安區信義路1號',Capital_Stock_Amount:'2000000',Company_Setup_Date:'1100101'} };
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext(); let calls=0;
 await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/, (route)=>{ calls++; const u=decodeURIComponent(route.request().url()); const m=u.match(/Business_Accounting_NO eq (\d{8})/); const n=u.match(/Company_Name like ([^ &]+)/); const row=m?REG[m[1]]:(n?REG[n[1]]:null); route.fulfill({status:200,contentType:'application/json;charset=UTF-8',headers:{'access-control-allow-origin':'*'},body:row?JSON.stringify([row]):''}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9069/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); await window.Store.saveRecords(r); localStorage.setItem('registry-auto','1'); localStorage.setItem('registry-proxy-url','https://x.workers.dev/'); },SEED);
 calls=0; await pg.reload(); await pg.waitForSelector('#btnImport');
 await pg.waitForFunction(()=>/商工登記自動更新/.test(document.querySelector('#toast')?.textContent||''),{timeout:30000}).catch(()=>{});
 const toast=await pg.textContent('#toast');
 chk(/已更新 2 筆/.test(toast), `第一次開站自動跑並套用：${toast}`);
 await pg.waitForTimeout(500);
 const st=await pg.evaluate(async()=>{const s=await window.Store.allStates(); return Object.fromEntries(s.map(x=>[x.recordId,x.edits||{}]));});
 chk(st['1']&&st['1'].owner==='新負責人'&&st['1'].address==='新北市新莊區中正路1號'&&st['1'].capital==='8,000'&&st['1'].founded==='2016', `甲：負責人、地址、資本額（元→仟元）、成立日都依登記更新：${JSON.stringify(st['1'])}`);
 chk(!st['2']||!Object.keys(st['2']).length, '乙跟登記一致，不動');
 chk(st['3']&&st['3'].taxId==='33333333'&&/大安區/.test(st['3'].address), `丙沒統編用名稱查，補上統編與地址：${JSON.stringify(st['3'])}`);
 const last=await pg.evaluate(()=>localStorage.getItem('registry-auto-last')+'|'+localStorage.getItem('registry-auto-summary'));
 chk(/^\d{4}-\d{2}-\d{2}\|查 3 筆，更新 2 筆，0 筆查不到$/.test(last), `記下今天與摘要：${last}`);
 const c1=calls; await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);
 chk(calls===c1, `同一天再開不會重跑（查詢次數 ${calls} 不變）`);
 // 設定視窗顯示上次結果，且「全部更新」也用同一套（登記一致 → 沒有要更新）
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#autoRegistry');
 chk(await pg.isChecked('#autoRegistry'), '設定視窗的「每天自動更新」勾著');
 chk(/上次自動更新：\d{4}\/\d{2}\/\d{2}，查 3 筆，更新 2 筆/.test(await pg.textContent('#editorBody')), '設定視窗顯示上次自動更新摘要');
 // 來源全掛時：當天記失敗、不套用、明天再試
 await ctx.unroute(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/); await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/,(route)=>route.fulfill({status:502,contentType:'text/plain',headers:{'access-control-allow-origin':'*'},body:'連不上政府網站'}));
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto-last','2000-01-01'); });
 await pg.reload(); await pg.waitForSelector('#btnImport');
 await pg.waitForFunction(()=>/商工登記自動更新/.test(document.querySelector('#toast')?.textContent||''),{timeout:30000}).catch(()=>{});
 const t2=await pg.textContent('#toast'); const sum=await pg.evaluate(()=>localStorage.getItem('registry-auto-summary'));
 chk(/失敗|明天再試/.test(t2)&&/全部失敗/.test(sum), `來源全掛：提示失敗、記下原因、不套用：${t2}｜${sum}`);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
