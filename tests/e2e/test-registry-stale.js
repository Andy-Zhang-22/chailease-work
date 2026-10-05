// 防呆：查到的核准變更日期比名單上的舊（鏡像的舊快照）就不套用，地址不會被改回去
const { chromium } = require('playwright');
const { installAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(8972);
const mk=(id,name,tax,addr)=>({id,source:'名單.pdf',company:name,aliases:[],taxId:tax,grade:'A',founded:'2010',capital:'5,000',phoneRaw:'02-1111-1111',phones:[{digits:'0211111111',ext:'',note:''}],owner:'王',keyman:'',industry:'營造業',address:addr,city:'',district:'',notesRaw:'',timeline:[],outcome:'contacted',nextDate:'',lastDate:'',addedDate:'2026-09-01'});
const SEED=[mk('A1','甲工程有限公司','11111111','新北市新莊區富貴路568號6樓')];
let API=[];
const row=(addr,chg)=>[{Business_Accounting_NO:'11111111',Company_Name:'甲工程有限公司',Responsible_Name:'王',Company_Location:addr,Capital_Stock_Amount:'5000000',Change_Of_Approval_Data:chg}];
const grid=(pg)=>pg.evaluate(()=>{const o={};document.querySelectorAll('#drawerBody dl.detail-grid').forEach((dl)=>{const k=[...dl.children];for(let i=0;i<k.length;i++){if(k[i].tagName==='DT')o[k[i].textContent]=(k[i+1]||{}).textContent||'';}});return o;});   // 常看的＋「更多資料」兩個 dl 都讀
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage({viewport:{width:1100,height:1300}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg,true);
 await pg.route('**/data.gcis.nat.gov.tw/**',(r)=>r.abort('failed'));
 await pg.route('**/my-worker.test/**',(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(API)}));
 await pg.goto('http://localhost:8972/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-auto','0'); await window.Store.saveRecords(r);
   await window.Store.setState({recordId:'A1',edits:{regChanged:'2026/09/17'},editsAt:Date.now(),updatedAt:Date.now()}); },SEED);
 await pg.reload(); await pg.waitForTimeout(900);
 const run=async(api)=>{ API=api; await pg.click('#btnMenu'); await pg.click('#menu [data-act="menu-more"]'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#editorBody h2');
   await pg.fill('#proxyUrl','https://my-worker.test/'); await pg.dispatchEvent('#proxyUrl','change');
   await pg.selectOption('#editorBody select','all').catch(()=>{});
   await pg.click('button:has-text("先試一筆")'); await pg.waitForTimeout(1500);
   await pg.click('button:has-text("全部更新")'); await pg.waitForTimeout(2500);
   const res=(await pg.textContent('#editorBody .rule-result:not(.proxy-diag)')).replace(/\s+/g,' '); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); return res; };
 const detail=async()=>{ await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300); await pg.locator('.card:has-text("甲工程") .card-name').click(); await pg.waitForSelector('#drawerBody h2'); const g=await grid(pg); const hist=(await pg.textContent('#drawerBody')).replace(/\s+/g,' '); await pg.keyboard.press('Escape'); await pg.waitForTimeout(300); return {g,hist}; };
 // 1. 鏡像回 1/21 的舊地址 562 → 不套用
 let res=await run(row('新北市新莊區富貴路562號6樓','1150121'));
 chk(/1 筆查到的比名單上的舊/.test(res), `結果說明有 1 筆較舊沒套用：${res.slice(0,140)}`);
 let d=await detail();
 chk(/568號6樓/.test(d.g['登記地址']||'') && /2026\/09\/17/.test(d.g['最近異動日期']||''), `地址還是 568 號、核准日期還是 9/17：${d.g['登記地址']} ${d.g['最近異動日期']}`);
 chk(!/變更登記地址/.test(d.hist), '沒有記成一次「變更登記地址」');
 // 2. 官方回 9/17 的 568 → 跟名單一致，沒變
 res=await run(row('新北市新莊區富貴路568號6樓','1150917'));
 chk(/登記資料跟名單一致|0 筆跟登記不一致/.test(res), `一致：${res.slice(0,100)}`);
 // 3. 真的有新的（10/01 核准搬到 570）→ 套用
 res=await run(row('新北市新莊區富貴路570號','1151001'));
 d=await detail();
 chk(/570號/.test(d.g['登記地址']||'') && /2026\/10\/01/.test(d.g['最近異動日期']||'') && /變更登記地址/.test(d.hist), `比較新的照常套用並記變更：${d.g['登記地址']} ${d.g['最近異動日期']}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'\n全部通過'); await br.close(); srv.close(); process.exit(bad?1:0);
})();
