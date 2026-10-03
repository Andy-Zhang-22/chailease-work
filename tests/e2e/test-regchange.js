const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9072);
const mk=(id,name,tax,o)=>({id,source:'A.csv',company:name,aliases:[],taxId:tax,grade:'',founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',...o});
const SEED=[mk('1','增資甲','11111111'),mk('2','減資乙','22222222'),mk('3','搬家丙','33333333'),mk('4','其他丁','44444444'),mk('5','沒變戊','55555555'),mk('6','查不到己','66666666'),mk('7','補地址庚','77777777',{address:'',city:'',district:''})];
const row=(t,name,o)=>({Business_Accounting_NO:t,Company_Name:name,Company_Status:'01',Responsible_Name:'王',Company_Location:'新北市新莊區中正路1號',Capital_Stock_Amount:'5000000',Company_Setup_Date:'0990101',...o});
const REG={'11111111':row('11111111','增資甲',{Capital_Stock_Amount:'8000000',Responsible_Name:'新老闆'}),
 '22222222':row('22222222','減資乙',{Capital_Stock_Amount:'2000000'}),
 '33333333':row('33333333','搬家丙',{Company_Location:'新北市泰山區明志路1號'}),
 '44444444':row('44444444','其他丁',{Company_Setup_Date:'1040101'}),
 '55555555':row('55555555','沒變戊'),
 '77777777':row('77777777','補地址庚')};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.route(/data\.gcis\.nat\.gov\.tw|x\.workers\.dev/, (route)=>{ const u=decodeURIComponent(route.request().url()); const m=u.match(/Business_Accounting_NO eq (\d{8})/); const r=m?REG[m[1]]:null; route.fulfill({status:200,contentType:'application/json;charset=UTF-8',headers:{'access-control-allow-origin':'*'},body:r?JSON.stringify([r]):''}); });
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9072/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },SEED);   // 這一段要看「還沒查核」的樣子，先別讓它邊跑邊寫
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 const chips=async()=>pg.evaluate(()=>[...document.querySelectorAll('#fltRegChange .chip')].map(c=>c.textContent.trim()));
 chk(JSON.stringify(await chips())===JSON.stringify(['0 增資','0 減資','0 變更登記地址','0 負責人異動','0 其他','0 無變更','7 未查核']), `還沒查核：七顆固定順序，全部未查核：${await chips()}`);
 // 開自動更新，重開一次
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto','1'); localStorage.setItem('registry-proxy-url','https://x.workers.dev/'); });
 await pg.reload(); await pg.waitForSelector('#btnImport');
 // 等整輪跑完再看分類：現在是每查完一筆就寫，中途看到的是半成品
 await pg.waitForFunction(()=>/完成|已停止/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:30000});
 await pg.waitForTimeout(300); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 chk(JSON.stringify(await chips())===JSON.stringify(['1 增資','1 減資','1 變更登記地址','1 負責人異動','1 其他','2 無變更','1 未查核']), `自動更新後分類：${await chips()}`);
 const names=async()=>pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent).sort());
 const pick=async(t)=>{ await pg.locator('#fltRegChange .chip').filter({hasText:new RegExp(t+'$')}).click(); await pg.waitForTimeout(300); };
 await pick('增資'); chk(JSON.stringify(await names())==='["增資甲"]', `增資：${await names()}`); await pick('增資');
 await pick('減資'); chk(JSON.stringify(await names())==='["減資乙"]', `減資：${await names()}`); await pick('減資');
 await pick('變更登記地址'); chk(JSON.stringify(await names())==='["搬家丙"]', `變更登記地址：${await names()}`); await pick('變更登記地址');
 await pick('負責人異動'); chk(JSON.stringify(await names())==='["增資甲"]', `負責人異動（同一家也算在增資）：${await names()}`); await pick('負責人異動');
 await pick('其他'); chk(JSON.stringify(await names())==='["其他丁"]', `其他（成立年）：${await names()}`); await pick('其他');
 await pick('無變更'); chk(JSON.stringify(await names())===JSON.stringify(['沒變戊','補地址庚'].sort()), `無變更（補空白不算變更）：${await names()}`); await pick('無變更');
 await pick('未查核'); chk(JSON.stringify(await names())==='["查不到己"]', `未查核（查不到的）：${await names()}`);
 await pg.click('#btnResetFilters'); await pg.waitForTimeout(300);
 const badge=(await pg.textContent('.card:has-text("增資甲") .badge-regchange').catch(()=>'')).replace(/\s+/g,' ').trim();
 chk(/^增資 \d+\/\d+、負責人異動 \d+\/\d+$/.test(badge), `卡片標記列出異動種類，各自帶日期：${badge}`);
 await pg.locator('.card:has-text("增資甲")').click(); await pg.waitForSelector('#drawerBody h2');
 const d=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/變更登記\s*\d{4}\/\d{2}\/\d{2}\s*增資、負責人異動/.test(d)&&/資本總額（仟元）：5,000 → 8,000/.test(d)&&/負責人：王 → 新老闆/.test(d)&&/已依登記更新上面的欄位。/.test(d)&&/最近查核 \d{4}\/\d{2}\/\d{2}/.test(d), `詳細頁列出種類、日期、前後值：${d.match(/變更登記.{0,120}/)?.[0]}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 // 隔天再查一次：資料已套用、登記一致 → 之前的異動要留著，不能變回無變更
 await pg.evaluate(()=>{ localStorage.setItem('registry-auto-last','2000-01-01'); });
 await pg.reload(); await pg.waitForSelector('#btnImport');
 // 等整輪跑完再看分類：現在是每查完一筆就寫，中途看到的是半成品
 await pg.waitForFunction(()=>/完成|已停止/.test(document.querySelector('#registryBarTitle')?.textContent||''),{timeout:30000});
 await pg.waitForTimeout(300); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 chk(JSON.stringify(await chips())===JSON.stringify(['1 增資','1 減資','1 變更登記地址','1 負責人異動','1 其他','2 無變更','1 未查核']), `隔天再查沒新異動，分類保留：${await chips()}`);
 // 異動日比查核日舊時，畫面要講白「後來再對過，沒有新的變動」，不然會被當成沒更新
 await pg.evaluate(async()=>{ const st=(await window.Store.allStates()).find(x=>x.regChange&&x.regChange.kinds.includes('capitalUp'));
   const moved=(st.regChanges||[st.regChange]).map(c=>({ ...c, date:'2026-09-18' }));
   await window.Store.setState({ ...st, regChanges:moved, regChange:moved[0] }); });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(600);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 await pg.locator('.card:has-text("增資甲")').click(); await pg.waitForSelector('#drawerBody h2');
 const d2=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 chk(/變更登記\s*2026\/09\/18\s*增資、負責人異動/.test(d2)&&/已依登記更新上面的欄位。/.test(d2), `異動那天就套用進名單，畫面講明：${d2.match(/變更登記.{0,40}/)?.[0]}`);
 chk(/最近查核 \d{4}\/\d{2}\/\d{2}：這天再對過一次，跟登記一樣，沒有新的變動/.test(d2), `查核日比異動日新時說清楚：${d2.match(/最近查核.{0,45}/)?.[0]}`);
 // 「最近核准變更」那一列後面要接上查到什麼，不用捲到下面才知道
 chk(/最近異動日期.{0,12}查到增資、負責人異動 2026\/09\/18/.test(d2),
   `最近核准變更那列接上變更內容：${d2.match(/最近異動日期.{0,70}/)?.[0]}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 同步合併：查核時間新的那份贏
 const merged=await pg.evaluate(()=>{ const a={recordId:'1',updatedAt:10,regAt:10,regChange:{date:'2026-09-01',kinds:['capitalUp'],changes:{}}}; const b={recordId:'1',updatedAt:20}; const m=window.DriveSync.mergeDumps({records:[{id:'1',source:'A.csv',company:'x'}],logs:[],states:[a]},{records:[{id:'1',source:'A.csv',company:'x'}],logs:[],states:[b]}); return m.states[0]; });
 chk(merged.regAt===10&&merged.regChange&&merged.regChange.kinds[0]==='capitalUp', `同步合併保留查核結果：${JSON.stringify(merged)}`);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
