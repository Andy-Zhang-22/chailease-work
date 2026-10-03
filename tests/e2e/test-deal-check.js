const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9083);
const mk=(id,name,o)=>({id,source:'A.csv',company:name,aliases:[],taxId:id.repeat(8).slice(0,8),grade:'',founded:'2015',capital:'30,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',addressActual:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',...o});
const SEED=[
 mk('1','微企舊戶甲',{capital:'4,000',notesRaw:'2026/09/10 本餘 300 萬在微企，老闆說想再做 500 萬設備'}),
 mk('2','外區乙',{address:'臺北市大安區信義路1號',addressActual:'新北市新莊區中正路9號',notesRaw:'2026/09/01 電話中聊，目前沒有跟中租往來'}),
 mk('3','城北舊戶丙',{notesRaw:'2026/09/05 目前還在跟城北往來，本於1200萬'}),
 mk('4','乾淨丁',{notesRaw:'2026/09/05 電話中聊，之前跟和潤做過，銀行有玉山額度'}),
 mk('5','共同區戊',{address:'雲林縣土庫鎮中正路1號',addressActual:'雲林縣土庫鎮中正路1號',notesRaw:'2026/09/05 電話中聊，沒有跟中租往來'}),
 mk('6','共同區己',{address:'雲林縣土庫鎮中正路2號',addressActual:'雲林縣土庫鎮中正路2號',notesRaw:'2026/09/05 本餘 500 萬在中租'}),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1200,height:1400}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9083/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 純函式：本餘解析
 const pb=await pg.evaluate(()=>['本餘 300 萬','本於1200萬','本餘約 5,000 仟','本餘 8,000,000','本餘 350','沒有本餘'].map(t=>window.Rules.parseBalance(t)));
 chk(JSON.stringify(pb)==='[3000,12000,5000,8000,3500,null]', `本餘解析成仟元：${JSON.stringify(pb)}`);
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(400);
 const open=async(name)=>{ await pg.locator(`.card:has-text("${name}")`).click(); await pg.waitForSelector('#drawerBody h2'); await pg.click('#drawerBody button:has-text("承作檢核")'); await pg.waitForSelector('#editorBody .deal-result'); };
 const txt=async()=>(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 const fill=async(sel,v)=>{ await pg.fill(sel,v); await pg.waitForTimeout(150); };
 const fieldInput=(label)=>`#editorBody label.rule-field:has(span:text-is("${label}")) input, #editorBody label.rule-field:has(span:text-is("${label}")) textarea`;
 const fieldSelect=(label)=>`#editorBody label.rule-field:has(span:text-is("${label}")) select`;

 // 甲：微企舊戶、本餘 3,000，本案 2,000 → 累計 5,000 ≤ 7,000 → 需向微企處申覆；Spread 8 → 衝突
 await open('微企舊戶甲');
 let t=await txt();
 chk(/承作檢核：微企舊戶甲/.test(t), '從詳細頁打開承作檢核');
 chk(await pg.inputValue(fieldInput('客戶既有本餘（仟元）'))==='3000'&&/從訪談內容抓到「本餘」約 3,000 仟元/.test(t), '本餘自動從訪談帶入 3,000');
 chk(/有跟中租往來（微企處）/.test(t)&&/資本額\s*4,000 仟元/.test(t)&&!/微企處客戶範疇|微型企業營業處】客戶範疇/.test(t)&&/登記地址在本行銷區（新莊分公司/.test(t), `判讀事實：${t.match(/從名單與訪談內容判讀到的.{0,160}/)?.[0]}`);
 await fill(fieldInput('本案金額（仟元）'),'2000'); await fill(fieldInput('本案 Spread（%）'),'8');
 t=await txt();
 chk(/有 \d 項跟規則衝突/.test(t)&&/衝突：客戶是微企處舊戶，單戶累計 5,000 仟元仍在微企處授信上限/.test(t), `微企舊戶且累計在上限內 → 衝突：${t.match(/有 \d 項跟規則衝突.{0,30}/)?.[0]}`);
 chk(/衝突：本案 Spread 8% 未高於 9%/.test(t), 'Spread 8% 未達 9% → 衝突');
 chk(/調整建議/.test(t)&&/先向微企處申覆客戶移交/.test(t)&&/把本案 Spread 拉高到 9% 以上/.test(t), '給出申覆／協銷與拉高 Spread 的建議');
 // 本案改 6,000 → 累計 9,000 > 7,000 → 微企處應主動移交；但單筆未達 10,000 → 衝突並建議提高
 await fill(fieldInput('本案金額（仟元）'),'6000'); await fill(fieldInput('本案 Spread（%）'),'');
 t=await txt();
 chk(/微企處應主動辦理移交/.test(t)&&/單筆最低起租金額為 10,000 仟元（含），本案 6,000 仟元未達門檻/.test(t)&&/把本案起租金額提高到 10,000 仟元/.test(t), '累計超過 7,000 → 主動移交，單筆未達 10,000 → 衝突與建議');
 await fill(fieldInput('本案金額（仟元）'),'12000'); t=await txt();
 chk(!/未達門檻/.test(t)&&/沒有衝突，但有 \d 項要先處理/.test(t), `金額拉到 12,000 後沒有衝突、只剩注意事項：${t.match(/沒有衝突.{0,30}/)?.[0]}`);
 // 頭小尾大：還款計畫檢核
 await pg.selectOption(fieldSelect('還款方式'),'頭小尾大'); await fill(fieldInput('期數（月）'),'24'); await fill(fieldInput('還款計畫（每期償還本金）'),'0,0,0,0,0,0,0,0,0,0,0,0,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000,1000');
 t=await txt();
 chk(/受「案件償還本金管理辦法」第四條管制/.test(t)&&/第 1 個檢核點（第 6 個月）累計至少要還 1,200 仟元，還款計畫只還 0 仟元/.test(t)&&/調整還款計畫：第 6 個月前累計償還至少 1,200 仟元/.test(t), '頭小尾大前 12 期不還本 → 檢核點衝突與建議');
 await pg.locator('#editorBody .chip:has-text("不動產")').click(); t=await txt();
 chk(!/第 1 個檢核點/.test(t)&&/屬第四條列舉可排除者/.test(t), '徵提不動產後不受管制');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 乙：登記地址台北大安（城中分公司），實際地址在新莊 → 跨區衝突，建議用實際地址申覆
 await open('外區乙'); t=await txt();
 chk(/衝突：客戶登記地址在「城中分公司（北一分處）」行銷區，不是本行銷區（新莊分公司）/.test(t), '登記地址在別的行銷區 → 協銷衝突');
 chk(/實際地址在本行銷區（新莊分公司（北二分處））：可依「申覆變更歸屬」第\(一\)款/.test(t), '實際地址在本區 → 建議申覆變更歸屬');
 chk(/沒有跟中租往來/.test(t), '訪談判讀：沒有跟中租往來');
 await pg.selectOption(fieldSelect('我的分公司'),'城中'); await pg.waitForTimeout(200); t=await txt();
 chk(/符合：登記地址在本行銷區（城中分公司/.test(t), '把我的分公司改成城中就不衝突');
 chk(await pg.evaluate(()=>localStorage.getItem('my-branch'))==='城中', '我的分公司會記住');
 await pg.selectOption(fieldSelect('我的分公司'),'新莊'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 丙：跟城北往來 → 已歸屬其他單位 → 協銷；本於 1200 萬 → 12,000
 await open('城北舊戶丙'); t=await txt();
 chk(/衝突：訪談內容顯示客戶目前跟「一般組其他單位（城北）」往來，客戶已歸屬其他單位/.test(t)&&await pg.inputValue(fieldInput('客戶既有本餘（仟元）'))==='12000', '城北舊戶 → 協銷衝突，本於 1200 萬 → 12,000');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);

 // 丁：乾淨的新戶，本區，一般組 30,000 資本；金額 8,000 → 沒有衝突
 await open('乾淨丁'); await fill(fieldInput('本案金額（仟元）'),'8000'); await fill(fieldInput('期數（月）'),'36'); t=await txt();
 chk(/照這個架構送件沒有跟規則衝突/.test(t), `乾淨新戶沒有衝突：${t.match(/(有 \d 項跟規則衝突|沒有衝突|照這個架構).{0,400}/)?.[0]}`);
 chk(/同業往來\s*和潤/.test(t)&&/銀行往來\s*玉山/.test(t), '同業與銀行往來列為事實但不影響歸屬');
 await pg.selectOption(fieldSelect('案件類型'),'存貨擔保融資'); t=await txt();
 chk(/衝突：存貨擔保融資是【高屏一科、二科】專屬業務/.test(t)&&/協銷予高屏一科、二科承作/.test(t), '存貨擔保融資非高屏 → 衝突與建議');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 // 戊：土庫（彰化／嘉義共同區）、沒跟中租往來 → 可申覆，不是衝突
 await open('共同區戊'); t=await txt();
 chk(/注意：登記地址在「彰化、嘉義分公司」的共同區，本分公司（新莊）不在其中；客戶目前沒有跟該區單位往來，可向「嘉義分公司」申覆後承作/.test(t)&&!/衝突：登記地址在「彰化、嘉義分公司」/.test(t), '別分公司共同區、沒往來 → 注意可申覆');
 chk(/向 嘉義分公司 提出申覆/.test(t), '建議到申覆系統向被申覆單位申覆');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 // 己：同樣共同區但有本餘 → 衝突要協銷
 await open('共同區己'); t=await txt();
 chk(/衝突：登記地址在「彰化、嘉義分公司」的共同區，本分公司（新莊）不在其中，而且訪談內容顯示客戶已跟中租往來，應採協銷/.test(t), '別分公司共同區、有往來 → 衝突協銷');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
