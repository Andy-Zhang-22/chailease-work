// 每週覆盤（使用者：「都做」）：一週的通數、接通率、各來源與訊號成效、跟上週比；交給分身（不帶電話）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9575);
const TODAY='2026-10-05';
const mk=(id,company,o)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:'3000000'+id,grade:'',founded:'2018',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'2026-10-20',lastDate:null,addedDate:'2026-09-01'},o);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T10:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('claude-twin-url','https://claude.ai/project/abc123');}catch(e){}
   window.__copied=[]; window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return null;};
   try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied.push(t);}},configurable:true}); }catch(e){} });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9575/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(recs)=>{ await window.Store.saveRecords(recs); let t=Date.now()-1e8;
   const log=(id,date,text,outcome)=>window.Store.addLog({recordId:id,date,text,outcome,createdAt:(t+=1000)});
   await log('1','2026-09-29','老闆要週轉金 500 萬，電話 0912-345-678','contacted');
   await log('2','2026-09-29','','noanswer');
   await log('2','2026-09-30','財務說再評估','contacted');
   await log('3','2026-10-01','','noanswer');
   await log('4','2026-10-02','說不要再打','blocked');
   await log('5','2026-09-22','上週打的','contacted');
 },[mk('1','動保甲有限公司',{source:'每日新名單-2026-09-29',notesRaw:'動保：跟和潤借\n每日新名單，符合：利率不敏感（跟和潤借）、3 個月內到期'}),
    mk('2','清冊乙有限公司',{source:'每日新名單-2026-09-29',notesRaw:'新公司清冊\n每日新名單，符合：本期增資'}),
    mk('3','自己丙有限公司'),mk('4','自己丁有限公司'),mk('5','上週戊有限公司')]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 const w=await pg.evaluate(()=>window.weeklyReview('2026-10-01'));
 chk(w.from==='2026-09-28' && w.to==='2026-10-04', `週一到週日：${w.from}～${w.to}`);
 chk(w.calls===5 && w.companies===4 && w.reached===2 && w.missed===1 && w.blocked===1, `數字：${JSON.stringify(w)}`);
 chk(JSON.stringify(w.perDay)==='[0,2,1,1,1,0,0]', `每天的通數：${w.perDay}`);
 chk(w.bySource['動產擔保'].n===1 && w.bySource['動產擔保'].reached===1 && w.bySource['登記清冊'].reached===1 && w.bySource['自己的名單'].n===2 && w.bySource['自己的名單'].reached===0, `各來源：${JSON.stringify(w.bySource)}`);
 chk(w.bySignal['利率不敏感'].n===1 && w.bySignal['3 個月內到期'].n===1 && w.bySignal['本期增資'].reached===1, `各訊號（括號細節歸同一條）：${JSON.stringify(w.bySignal)}`);
 await pg.click('#btnMenu'); await pg.click('#menu [data-act="weekly"]'); await pg.waitForSelector('#editorBody .weekly');
 chk(/10\/05～10\/11/.test(await pg.textContent('#editorBody')), '打開是這週');
 await pg.click('#editorBody button:has-text("上一週")'); await pg.waitForTimeout(200);
 const txt=await pg.textContent('#editorBody .weekly');
 chk(/打了 5 通、聯絡 4 家：接通 2（50%）、未接 1、禁止推廣 1/.test(txt) && /上週（09\/21～09\/27）：打了 1 通、聯絡 1 家、接通 1（100%）/.test(txt), `畫面：${txt.slice(0,200)}`);
 chk(/動產擔保：聯絡 1、接通 1（100%）/.test(txt) && /利率不敏感：聯絡 1/.test(txt), '畫面有各來源、各訊號');
 await pg.click('#editorBody button:has-text("交給分身")'); await pg.waitForTimeout(200);
 const p=await pg.evaluate(()=>window.__copied[window.__copied.length-1]||'');
 chk((await pg.evaluate(()=>window.__opened))[0]==='https://claude.ai/project/abc123' && /請照專案說明，幫我做這週的覆盤/.test(p) && /動保甲有限公司：老闆要週轉金 500 萬/.test(p), `交給分身：${p.slice(0,120)}`);
 chk(!/0912|345-678|02-2222-3333/.test(p) && /（電話略）/.test(p), '不帶電話、內容裡的電話遮掉');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
