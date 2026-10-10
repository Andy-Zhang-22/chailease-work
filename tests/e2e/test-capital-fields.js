// 商工登記要收三個數字：資本總額、實收資本額、最近核准變更日期；範疇看資本總額
const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9197);
const mk=(id,company,taxId,capital)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'',capital,phoneRaw:'02-2222-1234',phones:[{digits:'0222221234',ext:'',note:''}],owner:'余成棋',keyman:'',industry:'',address:'臺北市松山區復興北路427巷26號1樓',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
// 名單本來帶的是實收資本額 491,600 仟元（跟使用者的檔案一樣）
const SEED=[mk('1','大中鋼鐵股份有限公司','57001161','491,600'), mk('2','小公司','22222222','3,000')];
const REG={ '57001161':{Business_Accounting_NO:'57001161',Company_Name:'大中鋼鐵股份有限公司',Company_Status:'01',Responsible_Name:'余成棋',
              Company_Location:'臺北市松山區復興北路427巷26號1樓',Capital_Stock_Amount:'1200000000',Paid_In_Capital_Amount:'491600000',
              Company_Setup_Date:'0571017',Change_Of_Approval_Data:'1140716'},
            '22222222':{Business_Accounting_NO:'22222222',Company_Name:'小公司',Company_Status:'01',Responsible_Name:'王',
              Company_Location:'新北市新莊區中正路1號',Capital_Stock_Amount:'3000000',Paid_In_Capital_Amount:'3000000',
              Company_Setup_Date:'1050301',Change_Of_Approval_Data:'0000000'} };
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/, (route)=>{ const u=decodeURIComponent(route.request().url()); const m=u.match(/Business_Accounting_NO eq (\d{8})/); const r=m?REG[m[1]]:null;
   route.fulfill({status:200,contentType:'application/json;charset=UTF-8',headers:{'access-control-allow-origin':'*'},body:r?JSON.stringify([r]):''}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9197/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 假裝今天的自動更新在改版前就跑過了：加了新欄位就該立刻重查，不能等到明天
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','1'); localStorage.setItem('registry-proxy-url','https://x.workers.dev/');
   localStorage.setItem('registry-auto-last', new Date().toISOString().slice(0,10));
   localStorage.removeItem('registry-fields-rev'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport');
 await pg.waitForFunction(()=>/完成|已停止/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:30000});
 await pg.waitForTimeout(400);

 const st=await pg.evaluate(async()=>{const s=await window.Store.allStates(); return Object.fromEntries(s.map(x=>[x.recordId,x.edits||{}]));});
 chk(st['1'] && st['1'].capital==='1,200,000', `資本總額依登記填 1,200,000 仟元：${st['1']&&st['1'].capital}`);
 chk(st['1'] && st['1'].capitalPaid==='491,600', `實收資本額另外存 491,600 仟元：${st['1']&&st['1'].capitalPaid}`);
 chk(st['1'] && st['1'].regChanged==='2025/07/16', `最近核准變更日期換算成西元：${st['1']&&st['1'].regChanged}`);

 // 名單原本填的是實收，被總額蓋過去不算增資
 const kinds=await pg.evaluate(async()=>{const s=await window.Store.allStates(); return Object.fromEntries(s.map(x=>[x.recordId,(x.regChange&&x.regChange.kinds)||[]]));});
 chk(JSON.stringify(kinds['1'])==='[]', `舊值剛好等於實收，不算增資：${JSON.stringify(kinds['1'])}`);

 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 await pg.locator('.card:has-text("大中鋼鐵") .card-name').click(); await pg.waitForSelector('#drawerBody h2');
 const d=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/資本總額\s*1,200,000 仟元（大企部範疇）/.test(d), `詳細頁：資本總額與範疇（看總額，不是實收）：${d.match(/資本總額.{0,30}/)?.[0]}`);
 chk(/實收資本額\s*491,600 仟元/.test(d), `詳細頁：實收資本額：${d.match(/實收資本額.{0,20}/)?.[0]}`);
 chk(/最近異動日期\s*2025\/07\/16/.test(d), `詳細頁：最近核准變更日期：${d.match(/最近異動日期.{0,16}/)?.[0]}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 // 登記上沒變更過的公司（政府回 0 年 0 月 0 日）：那一列還是要在，講明是沒有紀錄
 await pg.locator('.card:has-text("小公司") .card-name').click(); await pg.waitForSelector('#drawerBody h2');   // 點名稱：卡片正中央可能落在複製點上
 const d2=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/最近異動日期\s*1911年0月0日/.test(d2), `沒變更過就照登記原樣顯示：${d2.match(/最近異動日期.{0,20}/)?.[0]}`);
 const saved2=await pg.evaluate(async()=>{const s=await window.Store.allStates(); return (s.find(x=>x.recordId==='2')||{}).edits;});
 chk(saved2 && saved2.regChanged==='1911年0月0日', `存起來的也是原樣：${JSON.stringify(saved2&&saved2.regChanged)}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);

 // 規模篩選也是看資本總額：大中鋼鐵在大企部範疇
 const scales=await pg.evaluate(()=>[...document.querySelectorAll('#fltScale .chip')].map(c=>c.textContent.trim()));
 chk(scales.some(x=>/1 大企部範疇/.test(x))&&scales.some(x=>/1 微企範疇|1 一般組範疇/.test(x)), `規模分類依資本總額：${scales}`);

 // 貼上商工登記查詢頁也要收得到這三個
 const kv=await pg.evaluate(()=>window.Normalize.parseKeyValue('統一編號\t57001161\n公司名稱\t大中鋼鐵股份有限公司\n資本總額(元)\t1,200,000,000\n實收資本額(元)\t491,600,000\n代表人姓名\t余成棋\n最後核准變更日期\t114年07月16日'));
 chk(kv.capital==='1,200,000'&&kv.capitalPaid==='491,600'&&kv.regChanged==='2025/07/16', `貼上登記頁：總額／實收／變更日期都收得到：${JSON.stringify(kv)}`);

 // 記號留下來，下次打開就不會再重查一次
 const rev=await pg.evaluate(()=>localStorage.getItem('registry-fields-rev'));
 chk(!!rev, `記下欄位改版的記號：${rev}`);

 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
