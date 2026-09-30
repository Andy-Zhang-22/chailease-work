// 整理未排定的名單：沒日期的刪掉，有跟中租往來的留著並排到指定日，禁止推廣的不動，有日期的不動
const { chromium } = require('playwright');
const { installAsk, asked } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9487);
const mk=(id,company,taxId,extra)=>({id,source:'A.csv',company,aliases:[],taxId,grade:'',founded:'2012',capital:'1,500',phoneRaw:'02-2222-3333',phones:[{digits:'0222223333',ext:'',note:''}],owner:'',keyman:'',industry:'',address:'新北市新莊區中正路9號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'new',nextDate:'',lastDate:'',addedDate:'2026-09-01',importedAt:1,...extra});
const SEED=[
 mk('A','沒排也沒往來有限公司','11111111',{}),
 mk('B','往來中有限公司','22222222',{notesRaw:'2026/09/20 目前還在跟中租往來，本餘500萬'}),
 mk('C','有排日期有限公司','33333333',{nextDate:'2026-10-20'}),
 mk('D','禁止推廣有限公司','44444444',{}),
 mk('E','以前往來過有限公司','55555555',{notesRaw:'2026/09/01 之前有跟中租配合，去年已解約'}),
];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({acceptDownloads:true}); const pg=await ctx.newPage({viewport:{width:1300,height:1100}}); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg, true);
 await pg.goto('http://localhost:9487/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); await window.Store.setState({recordId:'D',outcome:'blocked',updatedAt:1}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(500);
 // 打開選單裡的整理
 await pg.evaluate(()=>document.querySelector('[data-act="prune-unscheduled"]').click()); await pg.waitForSelector('#pruneGo'); await pg.waitForTimeout(200);
 const txt=(await pg.textContent('#editorBody')).replace(/\s+/g,' ');
 chk(/有 4 家：/.test(txt), `未排定 4 家（C 有日期不算）：${txt.slice(0,80)}`);
 chk(/有跟中租往來的 2 家（往來中 1、以前往來過 1）/.test(txt), `往來中 1、以前往來過 1：${txt.slice(80,200)}`);
 chk(/禁止推廣的 1 家/.test(txt) && /其餘 1 家：刪掉/.test(txt), `禁止推廣 1、要刪 1`);
 chk(/沒排也沒往來有限公司/.test(txt), '列出要刪的是哪家');
 chk((await pg.inputValue('#pruneDate'))==='2027-04-16', `預設日期 2027-04-16：${await pg.inputValue('#pruneDate')}`);
 const dl=pg.waitForEvent('download',{timeout:8000}).catch(()=>null);
 await pg.click('#pruneGo'); await pg.waitForTimeout(1500);
 const got=await dl;
 chk(!!got, `先下載備份（有下載事件）：${got&&got.suggestedFilename()}`);
 chk((await asked(pg)).some(m=>/刪掉 1 家、把 2 家有往來的下次聯絡日設成 2027\/04\/16/.test(m)), `確認框講清楚：${(await asked(pg)).join(' | ').slice(0,120)}`);
 const after=await pg.evaluate(async()=>{ const all=await window.Store.allRecords(); const st=await window.Store.allStates(); const s=Object.fromEntries(st.map(x=>[x.recordId,x])); return all.map(r=>({id:r.id,next:(s[r.id]&&s[r.id].nextDate)||r.nextDate||''})).sort((a,b)=>a.id.localeCompare(b.id)); });
 chk(after.map(x=>x.id).join('')==='BCDE', `A 刪掉、其餘留著：${after.map(x=>x.id).join('')}`);
 chk(after.find(x=>x.id==='B').next==='2027-04-16' && after.find(x=>x.id==='E').next==='2027-04-16', `有往來的排到 2027-04-16：${JSON.stringify(after)}`);
 chk(after.find(x=>x.id==='C').next==='2026-10-20' && !after.find(x=>x.id==='D').next, '有日期的、禁止推廣的都沒動');
 const tomb=await pg.evaluate(async()=>{ const t=await window.Store.getTombstones(); return JSON.stringify(t).includes('11111111'); });
 chk(tomb, '刪掉的公司有記排除（以後匯入不會再回來）');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close(); console.log(bad?`\n${bad} 個失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
