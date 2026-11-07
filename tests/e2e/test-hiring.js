// 104 徵才（版本 387）：Mac 在使用者的 Chrome 查好的職缺數寫在同步檔設定 hiring-results，網站套用：有徵才的從候選池加進今天的名單、
// 卡片標「104 徵才 N 件」、今天要打排前面；沒徵才的不加；同一家不重複加；一天最多 5 家
// 版本 405：每週 104 徵才中候選池（hiring-pool-104）每天再補最多 3 家
// 版本 419：104 徵才中是每日揉合的必要條件
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9616);
const TODAY='2026-10-27';   // 週二
const HEAD=['公司名稱','統編','分級','成立','資本額','電話','負責人','KEYMAN','產業別','下次聯絡日','最近聯絡日','訪談內容','地址','名單新增日期','國家'].join(',');
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;   // 跟各頁 toStandardCsv 一樣：有逗號的欄位要加引號
const row=(name,tax,tel)=>[name,tax,'','2019','12,000',tel,'','','金屬製品製造業','__DAY__','','每日新名單，符合：剛登記工廠','新北市新莊區中正路1號',TODAY,''].map(q).join(',');
const mk=(i)=>({id:`r${i}`,source:'A.csv',company:`主力${i}有限公司`,aliases:[],taxId:String(20000000+i),grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:TODAY,lastDate:'',addedDate:'2026-10-01'});
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 // 版本 394：丙三的候選列沒電話（候選列來自排第一的名單），標案那份有它的手機，加進來要一起補上
 const PCC='\ufeff統編,名稱,組織型態,地址,電話,最近決標日,標案名稱,招標機關,決標金額,得標件數,首次決標日,案號,成立日期,資本額\n20000013,丙三工程有限公司,公司登記,新北市新莊區中正路1號,(0912)333444,2026-10-14,某工程,某機關,3890000,1,2026-10-14,1,108/09/03,12000000\n';
 await ctx.route('**/leads/pcc/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({generatedAt:'2026-10-26T20:00:00.000Z',cities:['新北市'],days:180,total:1,withPhone:1,latestDate:'2026-10-14',files:[{path:'pcc.csv',rows:1}]})}));
 await ctx.route('**/leads/pcc/pcc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:PCC}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9616/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async({recs,head,rows})=>{ await window.Store.saveRecords(recs); ['registry-auto','daily-feed-auto','leads-hunt','auto-rebalance'].forEach(k=>localStorage.setItem(k,'0'));
   await window.Store.setSetting('hiring-candidates', JSON.stringify({day:'2026-10-27',at:Date.now(),head,list:[
     {key:'20000011',name:'甲一精密有限公司',src:'新設工廠',row:rows[0]},
     {key:'20000012',name:'乙二機械股份有限公司',src:'登記清冊',row:rows[1]},
     {key:'20000013',name:'丙三工程有限公司',src:'登記清冊',row:rows[2]},
     {key:'20000001',name:'主力1有限公司',src:'登記清冊',row:rows[3]}]}));
   await window.Store.setSetting('hiring-results', JSON.stringify({at:Date.now(),list:[
     {key:'20000011',count:3,at:Date.now()},{key:'20000012',count:0,at:Date.now()},{key:'20000013',count:1,at:Date.now()},{key:'20000001',count:9,at:Date.now()}]}));
 },{recs:[1,2].map(mk),head:HEAD,rows:[row('甲一精密有限公司','20000011','02-2222-3333'),row('乙二機械股份有限公司','20000012','0933-111-222'),row('丙三工程有限公司','20000013',''),row('主力1有限公司','20000001','02-2222-3333')]});
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 const r1=await pg.evaluate(()=>window.applyHiring()); await pg.waitForTimeout(800);
 chk(r1.added===2 && /^每日新名單-2026-10-27-104\.csv$/.test(r1.name), `有徵才的 2 家加進來（0 件的不加、已在名單的不重複）：${JSON.stringify(r1)}`);
 const recs=await pg.evaluate(()=>[...document.querySelectorAll('#cards .card')].map(c=>({name:c.querySelector('.card-name').textContent.trim(),badges:[...c.querySelectorAll('.badge')].map(b=>b.textContent.trim())})));
 const jia=recs.find(r=>r.name==='甲一精密有限公司'), yi=recs.find(r=>r.name==='乙二機械股份有限公司');
 chk(jia && jia.badges.includes('104 徵才 3 件') && !yi, `甲一在名單上標 104 徵才 3 件、乙二（0 件）沒加：${JSON.stringify(recs.map(r=>r.name))}`);
 const rows=await pg.$$eval('#remindBar .remind-row .remind-name',a=>a.map(x=>x.textContent.trim()));
 chk(rows.length===4 && rows[0]==='甲一精密有限公司' && rows[1]==='丙三工程有限公司', `今天要打：104 有徵才的排最前、職缺多的先：${rows.join('|')}`);
 const bing=await pg.evaluate(async()=>{const all=await window.Store.allRecords(); const r=all.find(x=>x.company==='丙三工程有限公司'); const st=await window.Store.allStates(); const s=Object.values(st||{}).find(x=>x.recordId===r.id)||{}; return {raw:r.phoneRaw, edit:s.edits&&s.edits.phoneRaw, from:s.phoneSource&&s.phoneSource.name};});
 chk(bing.edit==='(0912)333444' && bing.from==='政府標案得標', `候選列沒電話的，從公開資料（標案）補上手機：${JSON.stringify(bing)}`);
 const r2=await pg.evaluate(()=>window.applyHiring());
 chk(r2.added===0, `再套一次不會重複加：${JSON.stringify(r2)}`);
 // 版本 410：每週 104 徵才中候選池（hiring-pool-104）改當第九個來源：合併頁列得到、每日揉合算進去；applyHiring 不再每天補 3 家（版本 405～409）
 await pg.evaluate(async({head,rows})=>{
   await window.Store.addTombstone('companies','tax:30000005',{company:'戊五被刪有限公司',taxId:'30000005'});
   await window.Store.setSetting('hiring-pool-104', JSON.stringify({week:'2026-W44',day:'2026-10-26',at:Date.now(),head,list:[
     {key:'20000011',name:'甲一精密有限公司',src:'104 徵才中',count:3,row:rows[0]},
     {key:'30000001',name:'子一電子有限公司',src:'104 徵才中',count:7,row:rows[1]},
     {key:'30000002',name:'丑二工業有限公司',src:'104 徵才中',count:0,row:rows[2]},
     {key:'30000005',name:'戊五被刪有限公司',src:'104 徵才中',count:9,row:rows[3]},
     {key:'30000003',name:'寅三實業有限公司',src:'104 徵才中',count:4,row:rows[4]},
     {key:'30000004',name:'卯四科技有限公司',src:'104 徵才中',count:2,fin:'財務經理',row:rows[5]},   // 版本 417：徵財務主管的
     {key:'30000006',name:'辰六精機有限公司',src:'104 徵才中',count:2,row:rows[6]}]}));
 },{head:HEAD,rows:[row('甲一精密有限公司','20000011','02-2222-3333'),row('子一電子有限公司','30000001','02-2666-7777'),row('丑二工業有限公司','30000002','02-2888-9999'),
   row('戊五被刪有限公司','30000005','02-2555-0000'),row('寅三實業有限公司','30000003','02-2444-5555'),row('卯四科技有限公司','30000004','02-2777-8888'),row('辰六精機有限公司','30000006','02-2111-2222')]});
 await pg.evaluate(()=>localStorage.setItem('leads-filters-open','1'));   // 合併頁的篩選攤開，籤才看得到
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1500);   // 刪過的公司（墓碑）是開網站時讀的
 const r3=await pg.evaluate(()=>window.applyHiring());
 chk(r3.added===0, `applyHiring 不再從每週池加：${JSON.stringify(r3)}`);
 const pv=await pg.evaluate(()=>window.mergedFeedPreview());
 const pn=(n)=>pv.find(x=>x.name===n);
 chk(pn('子一電子有限公司') && pn('子一電子有限公司').signals.includes('104 徵才中（7 件）') && pn('寅三實業有限公司') && pn('卯四科技有限公司') && pn('辰六精機有限公司'), `每週池的公司進每日揉合、帶訊號 104 徵才中（N 件）：${pv.map(x=>x.name+'('+x.signals.join('/')+')').join('、')}`);
 chk(!pn('丑二工業有限公司') && !pn('戊五被刪有限公司') && !pn('甲一精密有限公司'), `0 件、刪過、已在名單的不列：${pv.map(x=>x.name).join('|')}`);
 // 版本 417：徵財務主管的排最前（卯四只有 2 件，仍在 7 件的子一前面）、多一個訊號
 chk(pv[0] && pv[0].name==='卯四科技有限公司' && pv[0].signals.includes('104 徵財務主管（財務經理）'), `徵財務主管的排最前、帶訊號：${pv.map(x=>x.name).join('|')}／${pv[0]&&pv[0].signals.join('、')}`);
 // 合併頁：來源籤「104 徵才中」、只看它、卡片那句
 await pg.evaluate(()=>window.switchTab('mix')); await pg.waitForSelector('#mix-fSrc .chip'); await pg.waitForTimeout(1000);
 const chip=(await pg.locator('#mix-fSrc .chip:has-text("104 徵才中")').textContent().catch(()=>'')).replace(/\s+/g,' ');
 chk(/104 徵才中\s*5/.test(chip), `合併頁來源籤「104 徵才中」5 家（連已在名單的甲一也列、標已在名單）：${chip}`);
 await pg.locator('#mix-fSrc .chip:has-text("104 徵才中")').click(); await pg.waitForTimeout(500);
 const mixCards=await pg.$$eval('#paneMix .card', a=>a.map(x=>x.textContent.replace(/\s+/g,' ')));
 chk(mixCards.length===5 && mixCards.some(t=>/子一電子有限公司/.test(t) && /104 徵才中 7 件/.test(t)) && mixCards.some(t=>/甲一精密有限公司/.test(t) && /已在名單/.test(t)), `只看 104 徵才中 5 家、卡片寫職缺數、甲一標已在名單：${mixCards.length}`);
 chk(mixCards.some(t=>/卯四科技有限公司/.test(t) && /徵財務主管：財務經理/.test(t)), '合併頁卡片寫徵財務主管的職稱');
 // 從合併頁加入：備註帶 104 徵才中、卡片標 104 徵才 N 件
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#paneMix .card')].find(x=>x.textContent.includes('子一電子有限公司')); const b=c.querySelector('button.mix-add, .btn-primary'); if (b) b.click(); }); await pg.waitForTimeout(1500);
 const zi=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(x=>x.company==='子一電子有限公司'); return r?{notes:r.notesRaw,source:r.source,phone:r.phoneRaw}:null; });
 chk(zi && /^104 徵才中：7 件/.test(zi.notes) && /^104徵才中-/.test(zi.source) && zi.phone==='02-2666-7777', `合併頁加入：備註、來源、電話：${JSON.stringify(zi)}`);
 await pg.evaluate(()=>window.switchTab('all')); await pg.waitForTimeout(500);
 const zb=await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#cards .card')].find(x=>x.querySelector('.card-name').textContent.trim()==='子一電子有限公司'); return c?[...c.querySelectorAll('.badge')].map(b=>b.textContent.trim()):null; });
 chk(zb && zb.includes('104 徵才 7 件'), `名單卡片從備註標 104 徵才 7 件：${JSON.stringify(zb)}`);
 // 版本 417：加徵財務主管的那家，備註多一行、卡片標「・財務主管」
 await pg.evaluate(()=>window.switchTab('mix')); await pg.waitForTimeout(800);
 await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#paneMix .card')].find(x=>x.textContent.includes('卯四科技有限公司')); const b=c.querySelector('button.mix-add, .btn-primary'); if (b) b.click(); }); await pg.waitForTimeout(1500);
 const mao=await pg.evaluate(async()=>{ const r=(await window.Store.allRecords()).find(x=>x.company==='卯四科技有限公司'); return r?r.notesRaw:null; });
 chk(mao && /^104 徵才中：2 件[^\n]*\n徵財務主管：財務經理/.test(mao), `備註帶徵財務主管：${JSON.stringify(mao)}`);
 await pg.evaluate(()=>window.switchTab('all')); await pg.waitForTimeout(500);
 const mb=await pg.evaluate(()=>{ const c=[...document.querySelectorAll('#cards .card')].find(x=>x.querySelector('.card-name').textContent.trim()==='卯四科技有限公司'); return c?[...c.querySelectorAll('.badge')].map(b=>b.textContent.trim()):null; });
 chk(mb && mb.includes('104 徵才 2 件・財務主管'), `名單卡片標 104 徵才 2 件・財務主管：${JSON.stringify(mb)}`);
 // 版本 419：104 徵才中是必要條件——每日揉合只從池子裡挑；丙三在標案有電話、有訊號，但不在 104 池子，不挑；商行那份不受限（這裡沒商行）
 const df=await pg.evaluate(()=>window.dailyFeed({more:true,awaitPhones:false})); await pg.waitForTimeout(1200);
 chk(df && df.picked>=1 && df.notHiring>=1 && Object.keys(df.bySrc||{}).every(k=>k==='104 徵才中'), `每日新名單只從 104 徵才中挑、不在 104 的（丙三）被濾掉：${JSON.stringify({picked:df&&df.picked,notHiring:df&&df.notHiring,bySrc:df&&df.bySrc})}`);
 const names=await pg.evaluate(async()=>(await window.Store.allRecords()).map(r=>r.company));
 chk(!names.includes('丙三工程有限公司') && names.includes('寅三實業有限公司'), `丙三沒進名單、寅三（池子裡）進了：${names.join('|')}`);
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
