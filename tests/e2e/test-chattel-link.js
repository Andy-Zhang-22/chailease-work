// 主名單對動保清冊：卡片標「跟誰借錢、什麼時候到期」、詳細頁列案件、篩選撈 3 個月內到期
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9488);
const TODAY='2026-10-05';
const q=(v)=>/[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v;
const HEAD='案件類別,登記編號,客戶統編,客戶名稱,金主統編,金主名稱,契約起,契約迄,擔保金額,標的物所在地,標的物件數,登記核准日,註銷日,成立日期';
const ROWS=[
 ['附條件買賣登記','112新經動字第004821號','28451237','禾泰精密工業有限公司','20000001','新鑫股份有限公司','2023/10/15','2026/11/12','12000000','新北市新莊區五權一路12號','3','2023/10/20','',''],
 ['動產抵押登記','110新經動字第007355號','28451237','禾泰精密工業有限公司','20000003','合迪股份有限公司','2021/11/28','2028/11/28','4500000','新北市新莊區五權一路12號','4','2021/12/01','',''],
 ['附條件買賣登記','108新經動字第001234號','28451237','禾泰精密工業有限公司','20000004','裕融企業股份有限公司','2019/03/01','2026/12/01','2000000','新北市新莊區五權一路12號','1','2019/03/05','',''],
 ['動產抵押登記','109新經動字第000100號','53217846','昱昌汽車貨運股份有限公司','20000002','和潤企業股份有限公司','2017/01/01','2020/01/01','3000000','新北市三重區重新路1號','1','2017/01/05','',''],
];
const CSV='﻿'+[HEAD,...ROWS.map(r=>r.map(q).join(','))].join('\n')+'\n';
const INDEX={generatedAt:'2026-09-26T14:36:42.637Z',dataThrough:'2026/07/02',total:4,kept:4,files:[{path:'ntpc.csv',rows:4}]};
const mk=(id,company,taxId)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'2026-10-20',lastDate:'',addedDate:'2026-09-01',importedAt:1});
const SEED=[mk('1','禾泰精密工業有限公司','28451237'), mk('2','昱昌汽車貨運股份有限公司','53217846'), mk('3','沒動保有限公司','99999999')];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } }
   Date=D; }`);
 await ctx.route('**/leads/chattel/index.json*',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(INDEX)}));
 await ctx.route('**/leads/chattel/ntpc.csv*',r=>r.fulfill({status:200,contentType:'text/csv',body:CSV}));
 const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9488/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);
 const c1=pg.locator('#paneList .card:has-text("禾泰")');
 const top=(await c1.locator('.card-top').textContent()).replace(/\s+/g,' ');
 chk(/動保 新鑫 11\/12 到期/.test(top), `卡片標最近到期的那件：${top}`);
 chk(await c1.locator('.badge-chattel.is-soon').count()===1, '38 天內到期標紅');
 const meta=(await c1.locator('.card-meta').textContent()).replace(/\s+/g,' ');
 chk(/🏦 新鑫 附條件買賣 1,200 萬・還有 38 天（共 3 件）/.test(meta), `卡片內容：${meta}`);
 const c2=pg.locator('#paneList .card:has-text("昱昌")');
 chk(await c2.locator('.badge-chattel').count()===0, '只有過期案件的不標到期');
 // 篩選
 const chips=await pg.$$eval('#fltChattel .chip',a=>a.map(x=>x.textContent.replace(/\s+/g,' ').trim()).join('|'));
 chk(/1 ?3 個月內到期/.test(chips) && /1 ?12 個月內到期/.test(chips) && /2 ?有動保登記/.test(chips) && /1 ?清冊裡沒有/.test(chips), `篩選籤：${chips}`);
 await pg.locator('#fltChattel .chip:has-text("3 個月內到期")').click(); await pg.waitForTimeout(300);
 const names=await pg.$$eval('#paneList .card .card-name',a=>a.map(x=>x.textContent.trim()));
 chk(names.join('|')==='禾泰精密工業有限公司', `只看 3 個月內到期：${names.join('|')}`);
 await pg.locator('#fltChattel .chip:has-text("3 個月內到期")').click(); await pg.waitForTimeout(300);
 // 詳細頁
 await pg.locator('#paneList .card:has-text("禾泰")').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 const det=(await pg.textContent('#drawerBody .detail-chattel')).replace(/\s+/g,' ');
 chk(/新鑫股份有限公司 附條件買賣 1,200 萬/.test(det) && /2023\/10\/15 → 2026\/11\/12（還有 38 天到期）/.test(det), `詳細頁第一件：${det.slice(0,120)}`);
 chk(/合迪股份有限公司 動產抵押 450 萬/.test(det) && /登記 110新經動字第007355號/.test(det), '第二件也列了');
 chk(det.indexOf('新鑫股份有限公司') < det.indexOf('合迪股份有限公司'), '照日期新到舊：2023 的新鑫排在 2021 的合迪前面');
 // 收起來只顯示最新兩筆：2019 的裕融藏著，按展開才出來（使用者：「收起來後只顯示最新的兩筆」）
 const lis=pg.locator('#drawerBody .detail-chattel li');
 const visible=async()=>(await lis.evaluateAll(a=>a.filter(x=>!x.hidden).map(x=>x.querySelector('b').textContent.split('　')[0])));
 const tg=pg.locator('#drawerBody .chattel-more');
 chk((await lis.count())===3 && JSON.stringify(await visible())==='["新鑫股份有限公司","合迪股份有限公司"]' && /展開其他 1 件 ▾（其中 1 件 3 個月內到期）/.test(await tg.textContent()), `收起：只看最新兩筆、按鈕講還有幾件：${JSON.stringify(await visible())} ${await tg.textContent()}`);
 await tg.click(); await pg.waitForTimeout(150);
 chk(JSON.stringify(await visible())==='["新鑫股份有限公司","合迪股份有限公司","裕融企業股份有限公司"]' && /收起，只看最新兩筆/.test(await tg.textContent()) && /共 3 件/.test(await pg.textContent('#drawerBody .detail-chattel')), `展開：三件都在：${JSON.stringify(await visible())}`);
 await tg.click(); await pg.waitForTimeout(150);
 chk((await visible()).length===2, '再按收回去');
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
 await pg.locator('#paneList .card:has-text("沒動保")').click(); await pg.waitForSelector('#drawerBody h2'); await pg.waitForTimeout(300);
 chk(/清冊裡沒有這家/.test(await pg.textContent('#drawerBody .detail-chattel')), '沒對到的講清楚');
 await pg.keyboard.press('Escape');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`\n${bad} 個失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
