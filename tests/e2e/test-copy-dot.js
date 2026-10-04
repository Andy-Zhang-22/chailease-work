// 複製鈕改成一顆灰點：沒有文字、按得到、按了有回饋、複製到的東西不變
const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9206);
const rec={id:'1',source:'A.csv',company:'甲公司',aliases:[],taxId:'11111111',grade:'',founded:'2015',capital:'12,000',
 phoneRaw:'02-1111-1111\n0912-345-678',phones:[],owner:'王',keyman:'',industry:'',address:'新北市新莊區中正路1號',city:'',district:'',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01'};
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({permissions:['clipboard-read','clipboard-write']}); const pg=await ctx.newPage();
 const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9206/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords([r]); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); },rec);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 await pg.click('.tab[data-tab="all"]'); await pg.waitForTimeout(300);

 chk(await pg.locator('.card .copy-dot').count()===1, `卡片變短只放一支電話、一顆點：${await pg.locator('.card .copy-dot').count()}`);
 chk(await pg.locator('.card').first().locator('text=複製').count()===0, '卡片上沒有「複製」兩個字了');

 const look=await pg.evaluate(()=>{const b=document.querySelector('.card .copy-dot');const r=b.getBoundingClientRect();
   const dot=getComputedStyle(b,'::before');
   // 按壓範圍是 ::after 疊出來的，量它才準
   const hit=b.querySelector?null:null;
   const after=getComputedStyle(b,'::after');
   const hitW=parseFloat(after.left)+parseFloat(after.right)+r.width;   // 左右都是負的 inset
   return {w:Math.round(r.width-parseFloat(after.left)-parseFloat(after.right)),
     h:Math.round(r.height-parseFloat(after.top)-parseFloat(after.bottom)),text:b.textContent,label:b.getAttribute('aria-label'),
     bg:dot.backgroundColor,dw:dot.width,radius:dot.borderRadius,font:getComputedStyle(b).fontSize};});
 chk(look.text==='', '按鈕本身沒有文字');
 chk(/複製電話/.test(look.label||''), `讀螢幕的人還看得到是什麼：${look.label}`);
 chk(look.w>=20&&look.h>=26, `按的範圍夠手指按：${look.w}×${look.h}`);
 chk(look.bg==='rgb(100, 116, 139)', `點是灰的（不跟卡片上的綠色標記搶眼）：${look.bg}`);
 chk(Math.abs(parseFloat(look.dw)-parseFloat(look.font)/2)<0.6&&look.radius==='999px',
   `點＝那行字的一半：字 ${look.font}、點 ${look.dw}`);

 // 按下去：複製到純數字、卡片不會被當成點擊而展開、點自己閃一下
 await pg.locator('.card .copy-dot').first().click(); await pg.waitForTimeout(150);
 chk(await pg.evaluate(()=>!!document.querySelector('.card .copy-dot.is-copied')), '按了之後那顆點會閃一下');
 chk(/已複製 0211111111/.test(await pg.textContent('#toast')), `複製的是純數字：${await pg.textContent('#toast')}`);
 chk(await pg.isHidden('#drawer'), '按複製不會誤開詳細頁');
 const clip=await pg.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
 chk(clip==='0211111111', `剪貼簿裡就是號碼：${clip}`);

 // 詳細頁：公司名稱旁也是一顆點
 await pg.locator('.card .card-name').first().click(); await pg.waitForSelector('#drawerBody h2');
 chk(await pg.locator('#drawerBody .detail-title .copy-dot').count()===1, '公司名稱旁一顆點');
 await pg.click('#drawerBody .detail-title .copy-dot'); await pg.waitForTimeout(200);
 chk(/已複製：甲公司/.test(await pg.textContent('#toast')), `複製公司名稱：${await pg.textContent('#toast')}`);

 // 統一編號那一列也有一顆（統編收在「更多資料」裡，先打開）
 await pg.click('#drawerBody details.detail-more > summary'); await pg.waitForTimeout(150);
 const taxDot=pg.locator('#drawerBody .detail-grid dd').filter({hasText:'11111111'}).locator('.copy-dot');
 chk(await taxDot.count()===1, `統編那列一顆點：${await taxDot.count()}`);

 // 大小與位置：點＝那行字的一半，而且跟字垂直置中
 const fit=await pg.evaluate(()=>{
   const out={};
   const measure=(dotSel, textNode) => {
     const b=document.querySelector(dotSel);
     const range=document.createRange(); range.selectNodeContents(textNode);
     const t=range.getBoundingClientRect(); const r=b.getBoundingClientRect();
     const dot=parseFloat(getComputedStyle(b,'::before').width);
     return { font:parseFloat(getComputedStyle(b).fontSize), dot,
       textMid:t.top+t.height/2, dotMid:r.top+r.height/2 };
   };
   const h2=document.querySelector('#drawerBody h2');
   out.name=measure('#drawerBody h2 .copy-dot', h2.firstChild);
   const dd=[...document.querySelectorAll('#drawerBody .detail-grid dd')].find(d=>d.querySelector('.copy-dot'));
   out.tax=measure('#drawerBody .detail-grid dd .copy-dot', dd.firstChild);
   return out;
 });
 chk(Math.abs(fit.name.dot-fit.name.font/2)<0.6, `公司名稱：字 ${fit.name.font}px、點 ${fit.name.dot}px（要是一半）`);
 chk(Math.abs(fit.tax.dot-fit.tax.font/2)<0.6, `統編：字 ${fit.tax.font}px、點 ${fit.tax.dot}px（要是一半）`);
 chk(fit.name.dot>fit.tax.dot, `字大的那顆點也大：${fit.name.dot} > ${fit.tax.dot}`);
 chk(Math.abs(fit.name.dotMid-fit.name.textMid)<1.5, `公司名稱那顆跟字垂直置中（差 ${(fit.name.dotMid-fit.name.textMid).toFixed(2)}px）`);
 chk(Math.abs(fit.tax.dotMid-fit.tax.textMid)<1.5, `統編那顆跟數字垂直置中（差 ${(fit.tax.dotMid-fit.tax.textMid).toFixed(2)}px）`);
 await taxDot.click(); await pg.waitForTimeout(250);
 chk(/已複製統一編號：11111111/.test(await pg.textContent('#toast')), `複製統編：${await pg.textContent('#toast')}`);
 const clip2=await pg.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
 chk(clip2==='11111111', `剪貼簿裡是統編：${clip2}`);
 // 沒統編的公司不會冒出一顆孤點
 const dots=await pg.evaluate(()=>[...document.querySelectorAll('#drawerBody .detail-grid dd')].filter(d=>d.querySelector('.copy-dot')).length);
 chk(dots===1, `只有統編那一列有點（其他列沒有）：${dots}`);

 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
