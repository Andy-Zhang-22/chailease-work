// 加到主畫面（manifest）與離線可開（sw.js）
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
// 版本 448：hang＝網路連得上但一直不回應（公司網路對 GitHub 就是這樣），回應先扣著不送
let hang=false; const held=[];
const srv=http.createServer((rq,rs)=>{ if(hang){ held.push(rs); return; } const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9497);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const ctx=await br.newContext();
 const pg=await ctx.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message));
 await pg.goto('http://localhost:9497/'); await pg.waitForSelector('#dropzone');
 const man=await pg.evaluate(async()=>{ const h=document.querySelector('link[rel=manifest]').href; const j=await (await fetch(h)).json(); return {name:j.name,short:j.short_name,display:j.display,icons:j.icons.map(i=>i.sizes)}; });
 chk(man.display==='standalone' && man.short==='電推名單' && man.icons.includes('192x192') && man.icons.includes('512x512'), `manifest：${JSON.stringify(man)}`);
 chk(await pg.evaluate(async()=>(await fetch('assets/icons/apple-touch-icon.png')).ok), 'iPhone 主畫面圖示在');
 await pg.evaluate(()=>navigator.serviceWorker.ready); await pg.reload(); await pg.waitForSelector('#dropzone'); await pg.waitForTimeout(800);
 chk(await pg.evaluate(()=>!!navigator.serviceWorker.controller), 'service worker 接手了');
 await pg.evaluate(async(r)=>{ await window.Store.saveRecords(r); localStorage.setItem('daily-feed-auto','0'); localStorage.setItem('auto-rebalance','0'); localStorage.setItem('registry-auto','0'); },
   [{id:'1',source:'A.csv',company:'離線測試有限公司',aliases:[],taxId:'',phoneRaw:'02-2222-3333',phones:[],address:'新北市新莊區中正路1號',notesRaw:'',timeline:[],outcome:'new',importedAt:1}]);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 await ctx.setOffline(true);
 await pg.reload(); await pg.waitForSelector('#btnImport',{timeout:15000}); await pg.waitForTimeout(1000);
 chk(await pg.locator('#cards .card',{hasText:'離線測試有限公司'}).count()===1, '沒網路也打得開、名單看得到');
 chk(await pg.evaluate(()=>getComputedStyle(document.querySelector('.topbar')).display!=='none'), '樣式也有（css 從快取來）');
 await ctx.setOffline(false);
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(1200);
 // 版本 448（使用者在公司電腦：「為甚麼網頁開不起來?」整片空白）：網路連得上但一直不回應，也要幾秒內用存著的那份開起來，不能乾等逾時
 hang=true;
 const t0=Date.now();
 await pg.reload({waitUntil:'commit',timeout:20000}).catch(()=>{});
 let shown=true; try{ await pg.waitForSelector('#btnImport',{timeout:15000}); }catch(e){ shown=false; }
 const took=Date.now()-t0;
 chk(shown && took<12000, `網路一直不回應：${(took/1000).toFixed(1)} 秒內用存著的那份開起來（等 3 秒就不等了）`);
 // 名單要等假日表那種「最多等 3 秒」的小檔放棄之後才畫出來，給它幾秒
 let listed=true; try{ await pg.waitForSelector('#cards .card:has-text("離線測試有限公司")',{timeout:10000}); }catch(e){ listed=false; }
 chk(shown && listed, `名單照樣看得到（開頁後 ${((Date.now()-t0)/1000).toFixed(1)} 秒）`);
 chk(shown && await pg.evaluate(()=>getComputedStyle(document.querySelector('.topbar')).display!=='none'), '樣式也有');
 hang=false; held.forEach((r)=>{ try{ r.destroy(); }catch(e){ /* 已經斷了 */ } });
 await pg.reload(); await pg.waitForSelector('#btnImport'); await pg.waitForTimeout(800);
 chk(await pg.locator('#cards .card',{hasText:'離線測試有限公司'}).count()===1, '網路恢復後照常開');
 chk(errs.length===0, `沒有 JS 錯誤：${errs.join(' | ')}`);
 console.log(bad?`${bad} 個失敗`:'全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
