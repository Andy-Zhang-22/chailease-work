// 今日撥打戰略（使用者：「每天要撥打的名單，在撥打前也都請分身做過戰略分析」、「比如哪幾間要先打或可以怎麼開場白」）
// 今天要打的分批交給分身 → 貼回分身照格式回的那段 → 拆開存到每一家 → 卡片「🧭 第幾打」、依分身順序排、詳細頁理由與開場白
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9559);
const TODAY='2026-10-05';
const mk=(id,company,extra)=>Object.assign({id,source:'A.csv',company,aliases:[],taxId:'3000000'+id,grade:'',founded:'2018',capital:'30,000',phoneRaw:'02-2222-333'+id,phones:[{digits:'022222333'+id,ext:'',note:''}],owner:'王O明',keyman:'',industry:'金屬加工',address:'新北市新莊區中正路1號',city:'新北市',district:'新莊區',notesRaw:'',timeline:[],outcome:'contacted',nextDate:TODAY,lastDate:'2026-09-20',addedDate:'2026-09-01'},extra);
const SEED=[mk('1','甲精密有限公司'),mk('2','乙貿易股份有限公司',{nextDate:'2026-10-01'}),mk('3','丙企業社'),mk('4','明天的有限公司',{nextDate:'2026-10-06'}),mk('5','禁打有限公司',{outcome:'blocked'})];
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(`{ const real=Date; window.__now=new real('${TODAY}T09:00:00').getTime();
   class D extends real { constructor(...a){ if(!a.length) super(window.__now); else super(...a); } static now(){ return window.__now; } } Date=D; }`);
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('hide-dealing','0'); localStorage.setItem('claude-twin-url','https://claude.ai/project/abc');}catch(e){}
   window.__copied=[]; window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return null;};
   try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied.push(t);}},configurable:true}); }catch(e){} });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9559/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(async(seed)=>{ await window.Store.saveRecords(seed);
   await window.Store.addLog({recordId:'1',date:'2026-09-20',text:'老闆說年底要擴廠，打 0912-345-678',outcome:'contacted',createdAt:Date.now()-9e8});
   await window.Store.setState({recordId:'1',outcome:'contacted',lastDate:'2026-09-20',nextDate:'2026-10-05',updatedAt:Date.now()});
   await window.Store.setState({recordId:'5',outcome:'blocked',lastDate:'2026-09-20',nextDate:'2026-10-05',updatedAt:Date.now()}); },SEED);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);

 // 從提醒列的「🧭 戰略」打開
 await pg.click('#remindBar button:has-text("🧭 戰略")'); await pg.waitForSelector('#editorBody .plan-paste');
 chk(/今天要打 3 家/.test(await pg.textContent('#editorBody')), `今天要打 3 家（今天、逾期；明天的、禁打的不算）：${(await pg.textContent('#editorBody')).slice(0,60)}`);
 await pg.click('#editorBody button:has-text("複製給分身")'); await pg.waitForTimeout(200);
 const p=await pg.evaluate(()=>window.__copied[window.__copied.length-1]||'');
 const op=await pg.evaluate(()=>window.__opened);
 chk(/幫我排今天要打的 3 家/.test(p) && /■ 1\. 公司名稱/.test(p) && /=== 1\. 乙貿易股份有限公司 ===/.test(p) && /甲精密有限公司/.test(p) && /丙企業社/.test(p) && !/明天的|禁打/.test(p), `給分身的名單與固定格式：${p.slice(0,120)}`);
 chk(/最近訪談：2026\/09\/20 老闆說年底要擴廠，打 （電話略）/.test(p) && !/0912|02-2222|王O明/.test(p), '帶最近訪談、電話遮掉、不帶負責人');
 chk(op[0]==='https://claude.ai/project/abc', '打開分身專案');
 // 貼回分身的回覆（有粗體、全形冒號、開場白兩行、多一家對不上）
 const reply=['好的，以下是今天的建議順序：','','■ 1. 甲精密有限公司','**理由**：年底擴廠、成立 8 年，最符合輪廓','開場白：王老闆您好，我是中租新莊分公司的，','聽說貴公司年底要擴廠，想跟您聊聊資金安排。','',
   '■ 2. 乙貿易','理由：逾期兩天，先把進度接回來','開場白：上次跟您聊到…','','■ 3. 不存在有限公司','理由：x','開場白：y'].join('\n');
 await pg.fill('#editorBody .plan-paste', reply); await pg.click('#editorBody button:has-text("存起來")'); await pg.waitForTimeout(500);
 const msg=await pg.textContent('#editorBody');
 chk(/已存 2 家的戰略；這幾家名字對不上，沒存：不存在有限公司/.test(msg), `拆開存：名字簡寫也對得上，對不上的列出來：${msg.match(/已存[^。]*。/)}`);
 await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
 const badges=await pg.$$eval('#cards .card',(cs)=>cs.map((c)=>c.querySelector('.card-name').textContent.trim()+'|'+((c.querySelector('.badge-twin')||{}).textContent||'')));
 chk(badges.includes('甲精密有限公司|🧭 第 1 打') && badges.includes('乙貿易股份有限公司|🧭 第 2 打') && badges.some((x)=>x==='丙企業社|'), `卡片標第幾打：${badges.join(' / ')}`);
 await pg.selectOption('#sortBy','twin'); await pg.waitForTimeout(300);
 const order=await pg.$$eval('#cards .card .card-name',(a)=>a.map((x)=>x.textContent.trim()));
 chk(order[0]==='甲精密有限公司' && order[1]==='乙貿易股份有限公司', `依分身建議順序：${order.join('、')}`);
 await pg.locator('#cards .card:has-text("甲精密") .card-name').click(); await pg.waitForSelector('#drawerBody .twin-plan');
 const tp=(await pg.textContent('#drawerBody .twin-plan')).replace(/\s+/g,' ');
 chk(/🧭 分身建議（今天第 1 打）/.test(tp) && /年底擴廠、成立 8 年，最符合輪廓/.test(tp) && /開場白：王老闆您好，我是中租新莊分公司的， 聽說貴公司年底要擴廠/.test(tp), `詳細頁的理由與開場白（兩行都在）：${tp}`);
 chk((await pg.locator('#menu [data-act="twin-plan"]').count())===0 && (await pg.locator('#remindBar button:has-text("🧭 戰略")').count())===1, '戰略只從名單上方的 🧭 進（選單那顆拿掉了）');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 await br.close(); srv.close();
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
})();
