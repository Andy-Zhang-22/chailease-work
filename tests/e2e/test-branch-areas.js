const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9080);
const mk=(id,name,address,addressActual)=>({id,source:'A.csv',company:name,aliases:[],taxId:'',grade:'',founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address,addressActual:addressActual||address,city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=[mk('1','新莊甲','新北市新莊區中正路1號'),mk('5','宜蘭戊','宜蘭縣宜蘭市中山路1號'),mk('6','花蓮己','花蓮縣花蓮市中正路1號'),mk('7','台東庚','臺東縣臺東市中華路1號'),mk('2','淡水乙','新北市淡水區中正路1號'),mk('3','龜山丙','桃園市龜山區民生北路一段38之1號','桃園縣龜山鄉民生北路一段38-1號'),mk('4','登記在台中實際在新莊','臺中市西屯區台灣大道1號','新北市新莊區中正路1號')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1200,height:1400}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9080/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 const B=(c,d)=>pg.evaluate(([c,d])=>window.Rules.branchOf(c,d),[c,d]);
 const cases=[
  ['新北市','新莊區','branch','新莊分公司（北二分處）'],
  ['新北市','樹林區','branch','新莊分公司（北二分處）'],
  ['新北市','淡水區','common','城北、新莊分公司共同區（申覆對象：城北分公司）'],
  // 新北、中和分公司合併為新北分公司後，這一整塊不再是共同區
  ['新北市','板橋區','branch','新北分公司（北一分處）'],
  ['新北市','土城區','branch','新北分公司（北一分處）'],
  ['新北市','汐止區','branch','城東分公司（北一分處）'],
  ['新北市','瑞芳區','branch','宜花分公司（北二分處，宜蘭一科、二科）'],
  ['臺北市','大安區','branch','城中分公司（北一分處）'],
  ['台北市','內湖區','branch','城北分公司（北一分處）'],
  ['基隆市','中正區','branch','城北分公司（北一分處）'],
  ['桃園市','龜山區','branch','桃園分公司（北二分處）'],
  ['桃園市','平鎮區','common','桃園、新竹分公司共同區（申覆對象：桃園分公司）'],
  ['新竹縣','竹北市','branch','新竹分公司（北二分處）'],
  ['苗栗縣','竹南鎮','branch','新竹分公司（北二分處）'],
  ['苗栗縣','通霄鎮','common','北台中、中彰分公司共同區（申覆對象：北台中分公司）'],
  ['臺中市','西屯區','common','北台中、南台中分公司共同區（申覆對象：北台中分公司／南台中分公司（擇任一方，可參考 EIP 拜訪紀錄））'],
  ['臺中市','豐原區','branch','北台中分公司（中區分處）'],
  ['彰化縣','員林市','branch','彰化分公司（中區分處）'],
  ['彰化縣','鹿港鎮','branch','中彰分公司（中區分處）'],
  ['雲林縣','斗六市','common','彰化、嘉義分公司共同區（申覆對象：彰化分公司）'],
  ['雲林縣','虎尾鎮','common','彰化、嘉義分公司共同區（申覆對象：嘉義分公司）'],
  ['臺南市','永康區','common','府城、台南分公司共同區（申覆對象：府城分公司）'],
  ['臺南市','東區','common','府城、台南分公司共同區（申覆對象：台南分公司）'],
  ['臺南市','新營區','branch','府城分公司（南區分處）'],
  ['高雄市','三民區','common','北高雄、南高雄分公司共同區（申覆對象：北高雄分公司）'],
  ['高雄市','鳳山區','common','南高雄、高屏分公司共同區（申覆對象：南高雄分公司）'],
  ['高雄市','小港區','branch','南高雄分公司（南區分處）'],
  ['屏東縣','屏東市','branch','高屏分公司（南區分處）'],
  ['臺東縣','臺東市','common','高屏、花蓮一科、花蓮二科共同區（申覆對象：高屏分公司）'],
  ['金門縣','金城鎮','shared','全公司共同區域（不屬任一分公司）'],
  ['','','',''],
 ];
 for(const [c,d,k,l] of cases){ const r=await B(c,d); chk(r.kind===k&&r.label===l, `${c}${d} → ${r.label||'（無）'}`); }
 // 規則頁有四條新規則
 await pg.evaluate(()=>window.switchTab('rules')); await pg.waitForTimeout(600);
 const rulesTxt=(await pg.textContent('#panel-rules, [data-panel="rules"], main').catch(()=>'' )||await pg.textContent('body')).replace(/\s+/g,' ');
 chk(/各分公司行銷區域劃分表/.test(rulesTxt)&&/附表一：共同區域與被申覆單位/.test(rulesTxt)&&/存貨擔保融資/.test(rulesTxt)&&/OSF 案件/.test(rulesTxt), '規則頁列出四條新規則');
 chk(/新莊.*樹林、三重、新莊、泰山、林口、蘆洲、五股、八里/.test(rulesTxt)&&/高屏一科、二科】專屬業務/.test(rulesTxt), '劃分表與存貨擔保融資的內容有顯示');
 // 詳細頁的行銷區域列（依登記地址）
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(400);
 const detail=async(name)=>{ await pg.locator(`.card:has-text("${name}")`).click(); await pg.waitForSelector('#drawerBody h2'); const t=(await pg.textContent('#drawerBody')).replace(/\s+/g,' '); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); return t; };
 let t=await detail('新莊甲'); chk(/行銷區域\s*新莊分公司（北二分處）/.test(t), `新莊甲：${t.match(/行銷區域.{0,40}/)?.[0]}`);
 t=await detail('淡水乙'); chk(/行銷區域\s*城北、新莊分公司共同區（申覆對象：城北分公司）/.test(t), `淡水乙：${t.match(/行銷區域.{0,60}/)?.[0]}`);
 t=await detail('龜山丙'); chk(/行銷區域\s*桃園分公司（北二分處）/.test(t), `龜山丙（登記地址新寫法）：${t.match(/行銷區域.{0,40}/)?.[0]}`);
 // 服務區域那一列只剩「範圍外」會顯示，所以這裡改驗：行銷區域看登記地址（台中），
 // 而實際地址在新莊＝服務範圍內，不會出現範圍外的協銷提醒
 t=await detail('登記在台中實際在新莊'); chk(/行銷區域\s*北台中、南台中分公司共同區/.test(t)&&!/範圍外/.test(t), `行銷區域看登記地址、服務區域看實際地址：${t.match(/行銷區域.{0,50}/)?.[0]}`);
 // 卡片標示與「歸屬分公司」篩選
 const badge=async(name)=>pg.evaluate((n)=>{const c=[...document.querySelectorAll('.card')].find(x=>x.textContent.includes(n)); return c?[...c.querySelectorAll('.badge-branch')].map(b=>b.textContent).join('|'):'';},name);
 chk(await badge('新莊甲')==='新莊分公司', `卡片標示分公司：${await badge('新莊甲')}`);
 chk(await badge('淡水乙')==='城北／新莊共同區', `共同區的卡片標示：${await badge('淡水乙')}`);
 chk(await badge('宜蘭戊')==='宜花分公司'&&await badge('花蓮己')==='宜花分公司'&&await badge('台東庚')==='高屏／宜花共同區', `宜蘭、花蓮都只標「宜花分公司」，台東標高屏／宜花共同區：${await badge('宜蘭戊')}｜${await badge('花蓮己')}｜${await badge('台東庚')}`);
 chk(await badge('登記在台中實際在新莊')==='北台中／南台中共同區', `依登記地址而非實際地址：${await badge('登記在台中實際在新莊')}`);
 const opts=await pg.evaluate(()=>[...document.querySelectorAll('#fltBranch option')].map(o=>o.textContent));
 chk(opts[0]==='全部'&&JSON.stringify(opts.slice(1).sort())===JSON.stringify(['新莊分公司（1）','城北／新莊共同區（1）','桃園分公司（1）','北台中／南台中共同區（1）','宜花分公司（2）','高屏／宜花共同區（1）'].sort()), `歸屬分公司是下拉選單、選項含筆數：${opts}`);
 await pg.selectOption('#fltBranch','新莊分公司'); await pg.waitForTimeout(300);
 const names=await pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent));
 chk(JSON.stringify(names)==='["新莊甲"]', `下拉選新莊分公司：${names}`);
 chk(await pg.textContent('#filters [data-group="branch"] .filter-count')==='1', '收合標題顯示已選 1');
 await pg.click('#btnResetFilters'); await pg.waitForTimeout(200);
 chk(await pg.inputValue('#fltBranch')===''&&(await pg.locator('#filters [data-group="branch"] .filter-count').count())===0, '清除後下拉回到全部、數字消失');
 await pg.click('#btnResetFilters'); await pg.waitForTimeout(200);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
