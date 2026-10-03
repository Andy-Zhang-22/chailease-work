const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9077);
const mk=(id,name,address,addressActual)=>({id,source:'A.csv',company:name,aliases:[],taxId:'',grade:'',founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'',address,addressActual,city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=[mk('1','迅德興業','桃園市龜山區民生北路一段38之1號','桃園縣龜山鄉民生北路一段38-1號'),mk('2','舊三重','臺北縣三重市重新路1號','臺北縣三重市重新路1號'),mk('3','怪地址','新北市新莊區中正路1號','工業區內第三棟'),mk('4','真的沒地址','','')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1400}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9077/index.html'); await pg.evaluate(()=>{try{localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0');localStorage.setItem('registry-auto','0');}catch(e){}}); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 const P=(a)=>pg.evaluate((a)=>window.Normalize.parseAddress(a),a);
 const cases=[['桃園縣龜山鄉民生北路一段38-1號','桃園市','龜山區'],['臺北縣板橋市文化路1號','新北市','板橋區'],['台北縣三重市重新路1號','新北市','三重區'],['臺中縣豐原市中正路1號','臺中市','豐原區'],['高雄縣鳳山市','高雄市','鳳山區'],['新竹縣竹北市光明六路','新竹縣','竹北市'],['新北市新莊區中正路1號','新北市','新莊區'],['台北市內湖區行善路','臺北市','內湖區']];
 for(const [a,c,d] of cases){ const r=await P(a); chk(r.city===c&&r.district===d, `${a} → ${r.city} ${r.district}（期望 ${c} ${d}）`); }
 const any=await pg.evaluate(()=>window.Normalize.parseAddressAny('工業區內第三棟','新北市新莊區中正路1號'));
 chk(any.city==='新北市'&&any.district==='新莊區', `實際地址看不出縣市就看登記地址：${JSON.stringify(any)}`);
 await pg.evaluate(async(r)=>{await window.Store.saveRecords(r);},SEED);
 await pg.reload(); await pg.waitForTimeout(900); await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(400);
 const chips=await pg.evaluate(()=>[...document.querySelectorAll('#fltCity .chip')].map(c=>c.textContent.trim()).sort());
 chk(JSON.stringify(chips)===JSON.stringify(['1 其他','1 桃園市','2 新北市'].sort()), `縣市：舊縣名也算得出來、真的沒地址才是其他：${chips}`);
 await pg.locator('#fltCity .chip').filter({hasText:/其他$/}).click(); await pg.waitForTimeout(300);
 const names=await pg.evaluate(()=>[...document.querySelectorAll('.card-name')].map(x=>x.textContent));
 chk(JSON.stringify(names)==='["真的沒地址"]', `其他只剩沒填的那筆：${names}`);
 await pg.click('#btnResetFilters'); await pg.waitForTimeout(300);
 await pg.locator('.card:has-text("迅德興業")').click(); await pg.waitForSelector('#drawerBody h2');
 const d=(await pg.textContent('#drawerBody')).replace(/\s+/g,' ');
 // 服務區域那一列只剩「範圍外」會顯示（其他的使用者說用不到），所以改成驗「沒有範圍外的提醒」
 chk(!/範圍外/.test(d), '迅德興業（桃園縣龜山鄉）被認得出在服務範圍內：沒有範圍外的協銷提醒');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
