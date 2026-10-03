// 新公司分頁照動產擔保的規格：跟名單比對、已在名單變綠、每張卡片可加入／藏起來
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9484);
const HEAD='統一編號,公司名稱,公司所在地,代表人,資本額,核准設立日期,核准變更日期,案由或變更事項,營業項目,縣市,清冊,期別';
const ROWS=[
 ['11111111','甲一精密有限公司','新北市新莊區中正路1號','王一','30000000','101/10/01','115/08/20','增資','CC01080 電子零組件製造業','新北市','change','11508'],
 ['22222222','乙二機械股份有限公司','新北市泰山區中港西路2號','李二','50000000','','115/08/21','增資','CB01010 機械設備製造業','新北市','change','11508'],
 ['33333333','丙三工程有限公司','新北市五股區五權路3號','張三','20000000','','115/08/22','增資','E601010 電器承裝業','新北市','change','11508'],
 ['44444444','丁四貿易有限公司','新北市新莊區中正路4號','陳四','10000000','','115/08/23','增資','F118010 資訊軟體批發業','新北市','change','11508'],
];
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={latest:'11508',generatedAt:'2026-09-26T17:00:00.000Z',periods:{'11508':{generatedAt:'2026-09-26T17:00:00.000Z',period:'11508',files:[{city:'新北市',type:'change',path:'11508/新北市-change.csv',rows:4,capitalUp:4}]}}};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'2026-09-12',addedDate:'2026-09-01',importedAt:1});
const SEED=[mk('1','乙二機械股份有限公司','22222222'), mk('2','丙三工程有限公司','33333333')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.route('**/leads/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/11508/*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 await ctx.route('**/leads/trade/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"generatedAt":"x"}'}));
 await ctx.route('**/leads/trade/phones.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:'統編,電話,傳真,核發日期\n11111111,0933000111,,2026/01/01\n22222222,02-2200-1111,,2026/01/01\n'}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9484/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('leads-hunt','0'); await window.Store.setState({recordId:'2',outcome:'blocked',updatedAt:1}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 await pg.evaluate(()=>window.switchTab('leads')); await pg.waitForSelector('#leads-cards .card'); await pg.waitForTimeout(500);
 // 停掉背景查成立年（不影響測試但省時間）
 await pg.click('#leads-founded-btn').catch(()=>{});
 const names=async()=>pg.$$eval('#leads-cards .card .card-name',a=>a.map(x=>x.textContent.trim()));
 let n=await names(); chk(n.length===4, `四家都在：${n.join('|')}`);
 const chips=await pg.$$eval('#leads-fMine .chip',a=>a.map(x=>x.textContent.trim()).join('|'));
 chk(chips==='名單裡沒有2|已在我的名單裡1|名單上禁止推廣1', `跟名單比對的籤：${chips}`);
 const c2=pg.locator('#leads-cards .card:has-text("乙二")');
 chk(await c2.evaluate(e=>e.classList.contains('is-mine')), '已在名單的卡片變綠');
 chk(/已在名單・9\/1 加入・上次 9\/12/.test(await c2.locator('.card-top').textContent()), `寫上次聯絡：${(await c2.locator('.card-top').textContent()).replace(/\s+/g,' ')}`);
 chk(await c2.locator('button:has-text("打開名單上這一家")').count()===1, '已在名單的按鈕是打開那一筆');
 await c2.locator('button:has-text("打開名單上這一家")').click(); await pg.waitForSelector('#drawerBody h2');
 chk(/乙二機械/.test(await pg.textContent('#drawerBody h2')), '真的打開那一筆'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 const c3=pg.locator('#leads-cards .card:has-text("丙三")');
 chk(/名單上禁止推廣/.test(await c3.locator('.card-top').textContent()), '禁止推廣的有寫出來');
 const c1=pg.locator('#leads-cards .card:has-text("甲一")');
 chk(await c1.locator('button.leads-add-one').count()===1 && await c1.locator('button.leads-hide').count()===1, '不在名單的有加入與這家不用了');
 chk(/加入客戶名單（2 家）/.test(await pg.textContent('#leads-add')), `整批按鈕寫還不在名單的家數：${await pg.textContent('#leads-add')}`);
 chk(/已在名單 2 家/.test(await pg.textContent('#leads-count')), `數量那一行：${(await pg.textContent('#leads-count')).replace(/\s+/g,' ')}`);
 // 篩選
 await pg.locator('#leads-fMine .chip:has-text("名單裡沒有")').click(); await pg.waitForTimeout(300); n=await names();
 chk(n.join('|')==='乙二機械股份有限公司'===false && n.length===2 && !n.includes('乙二機械股份有限公司'), `只看名單裡沒有的：${n.join('|')}`);
 await pg.locator('#leads-fMine .chip:has-text("名單裡沒有")').click(); await pg.waitForTimeout(300);
 // 電話籤：對出進口廠商電話表
 const pc=(await pg.locator('#leads-fPhone .chip').allTextContents()).map(t=>t.replace(/\s+/g,'')).join('|'); chk(pc==='有電話2|手機1|沒電話2', `電話籤：${pc}`);
 await pg.locator('#leads-fPhone .chip:has-text("手機")').click(); await pg.waitForTimeout(300); n=await names(); chk(n.join('|')==='甲一精密有限公司', `只按「手機」：${n.join('|')}`);
 chk(/📞 手機（多半是老闆本人）/.test(await pg.locator('#leads-cards .card').first().locator('.card-top').textContent()), '卡片標手機');
 await pg.locator('#leads-fPhone .chip:has-text("手機")').click(); await pg.waitForTimeout(300); n=await names(); chk(n.length===4, '放開籤');
 // 這家不用了
 await pg.locator('#leads-cards .card:has-text("丁四")').locator('button.leads-hide').click(); await pg.waitForTimeout(300); n=await names();
 chk(!n.includes('丁四貿易有限公司'), `藏起來：${n.join('|')}`);
 chk((await pg.textContent('#leads-hidden')).includes('顯示藏起來的 1 家'), '有顯示藏起來的按鈕');
 await pg.click('#leads-hidden'); await pg.waitForTimeout(300); n=await names(); chk(n.includes('丁四貿易有限公司'), '按一下看得到');
 await pg.locator('#leads-cards .card:has-text("丁四")').locator('button:has-text("放回來")').click(); await pg.waitForTimeout(300);
 chk(await pg.locator('#leads-hidden').isHidden(), '放回來之後按鈕消失');
 // 單張加入：走匯入流程（登記清冊會問條件），按匯入
 await c1.locator('button.leads-add-one').click(); await pg.waitForTimeout(800);
 const goBtn=pg.locator('#editorBody button:has-text("匯入")');
 if (await goBtn.count()) { await goBtn.first().click(); await pg.waitForTimeout(1200); }
 const recs=await pg.evaluate(async()=>{ const all=await window.Store.allRecords(); return all.filter(r=>r.taxId==='11111111').map(r=>({company:r.company,source:r.source,founded:r.founded})); });
 chk(recs.length===1, `單張加入進名單：${JSON.stringify(recs)}`);
 chk(recs[0] && recs[0].founded==='2012', `成立年一起帶進去：${recs[0]&&recs[0].founded}`);
 await pg.click('#importer .drawer-close').catch(()=>{}); await pg.waitForTimeout(300);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(200); await pg.evaluate(()=>window.switchTab('leads')); await pg.waitForTimeout(500);
 chk(await c1.evaluate(e=>e.classList.contains('is-mine')), '切回來之後甲一變成已在名單');
 chk(/加入客戶名單（1 家）/.test(await pg.textContent('#leads-add')), `按鈕數字跟著變：${await pg.textContent('#leads-add')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`\n${bad} 個失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
