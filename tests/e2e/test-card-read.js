// 拍名片給分身讀（使用者：「都做」）：新增客戶畫面「📇 拍名片給分身讀」複製讀名片的指示、打開分身；回覆貼回來自動填表
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9579);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext({viewport:{width:1300,height:1000}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('registry-auto','0'); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('claude-twin-url','https://claude.ai/project/abc123');}catch(e){}
   window.__copied=[]; window.__opened=[]; window.open=(u)=>{window.__opened.push(u); return null;};
   try{ Object.defineProperty(navigator,'clipboard',{value:{writeText:async(t)=>{window.__copied.push(t);}},configurable:true}); }catch(e){} });
 await ctx.route('**/leads/**',r=>r.fulfill({status:404,body:''}));
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await pg.goto('http://localhost:9579/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
 await pg.click('#editorBody button:has-text("拍名片給分身讀")'); await pg.waitForTimeout(200);
 const p=await pg.evaluate(()=>window.__copied[window.__copied.length-1]||'');
 chk(/附上一張名片的照片/.test(p) && /聯絡人：/.test(p) && /手機：/.test(p) && (await pg.evaluate(()=>window.__opened))[0]==='https://claude.ai/project/abc123', `複製指示並打開分身：${p.slice(0,40)}`);
 chk(/附上名片照片送出/.test(await pg.textContent('#editorBody .rule-note')), '提示下一步');
 await pg.fill('#kvPaste','- **公司名稱**：星辰精密有限公司\n- **統一編號**：無\n- **聯絡人**：陳大明\n- **職稱**：財務經理\n- **電話**：02-2222-3331 #12\n- **手機**：0912-345-678\n- **地址**：新北市新莊區中正路1號\n- **產業別**：金屬加工');
 await pg.waitForTimeout(200);
 chk(/已填入：公司名稱、登記地址、電話、KEYMAN、產業別/.test(await pg.textContent('#editorBody .rule-note')), `自動填表：${await pg.textContent('#editorBody .rule-note')}`);
 await pg.click('#editorBody button:has-text("新增")'); await pg.waitForTimeout(800);
 const v=await pg.evaluate(()=>{ const x=window.customerViews().find(v=>v.company==='星辰精密有限公司'); return x?[x.keyman,x.phones.length,x.address,x.industry].join('|'):''; });
 chk(v==='陳大明 財務經理|2|新北市新莊區中正路1號|金屬加工', `新增的客戶：${v}`);
 // 版本 423：只填統編就新增——貼上框只貼 8 碼、或統一編號那格打滿 8 碼，查商工登記自動填好，按「新增」
 await pg.evaluate(()=>{ window.Registry.lookupByKeyword=async(kw)=>{ const t=String(kw).replace(/\D/g,''); const db={'12345675':{taxId:'12345675',name:'晨光測試有限公司',status:'核准設立',owner:'林小華',address:'新北市新莊區中正路9號',capital:'5,000',capitalPaid:'5,000',founded:'2019/03/05',regChanged:'2026/01/10'},'87654325':{taxId:'87654325',name:'暮色測試股份有限公司',status:'核准設立',owner:'張小文',address:'新北市三重區重新路8號',capital:'12,000',capitalPaid:'',founded:'2015/06/01',regChanged:''}}; return db[t]?{ok:true,companies:[db[t]]}:{ok:false,companies:[],reason:'查不到'}; }; });
 await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
 await pg.fill('#kvPaste','12345675'); await pg.waitForTimeout(400);
 const f1=await pg.evaluate(()=>{ const i=[...document.querySelectorAll('#editorBody .edit-form input, #editorBody .edit-form textarea')]; return [i[0].value,i[1].value].join('|'); });
 chk(f1==='晨光測試有限公司|12345675' && /查到 晨光測試有限公司（核准設立）.*請按「新增」/.test(await pg.textContent('#editorBody .rule-note')), `貼上框只貼統編：自動填好公司名稱、統編：${f1}／${await pg.textContent('#editorBody .rule-note')}`);
 await pg.click('#editorBody button:has-text("新增")'); await pg.waitForTimeout(800);
 const v2=await pg.evaluate(()=>{ const x=window.customerViews().find(v=>v.taxId==='12345675'); return x?[x.company,x.owner,x.capital,x.founded,x.address].join('|'):''; });
 chk(v2==='晨光測試有限公司|林小華|5,000|2019/03/05|新北市新莊區中正路9號', `只填統編新增的客戶：${v2}`);
 // 統一編號那格直接打 8 碼（公司名稱空著）也會查
 await pg.evaluate(()=>document.querySelector('.way[data-act="new-customer"]').click()); await pg.waitForSelector('#kvPaste');
 await pg.fill('#editorBody .edit-form label:nth-of-type(2) input','87654325'); await pg.waitForTimeout(400);
 const f2=await pg.evaluate(()=>{ const i=[...document.querySelectorAll('#editorBody .edit-form input, #editorBody .edit-form textarea')]; return [i[0].value,i[1].value].join('|'); });
 chk(f2==='暮色測試股份有限公司|87654325', `統一編號那格打滿 8 碼：自動填好：${f2}`);
 await pg.fill('#kvPaste','99999999'); await pg.waitForTimeout(400);
 chk(/統編 99999999 查不到商工登記/.test(await pg.textContent('#editorBody .rule-note')), `查不到就提示自己填：${await pg.textContent('#editorBody .rule-note')}`);
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
