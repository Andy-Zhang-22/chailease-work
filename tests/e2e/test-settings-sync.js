const { chromium } = require('playwright');
const { installAsk, asked, clearAsked, clickAsk } = require('./askhelp');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'),T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=http.createServer((rq,rs)=>{const f=path.join(ROOT,rq.url==='/'?'index.html':decodeURIComponent(rq.url.split('?')[0]));
 fs.readFile(f,(e,b)=>{if(e){rs.writeHead(404);return rs.end();}rs.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});rs.end(b);});}).listen(9074);
(async()=>{
 let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
 const br=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined});
 const pg=await br.newPage(); const errs=[]; pg.on('pageerror',e=>errs.push(e.message)); pg.on('dialog',d=>d.accept());
 await installAsk(pg);   // 自己畫的確認框，不是原生 dialog
 await pg.goto('http://localhost:9074/index.html'); await pg.waitForSelector('#dropzone'); await pg.click('#importer .drawer-close');
 // 這台設定代理與每天自動更新
 await pg.click('#btnMenu'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#proxyUrl');
 await pg.fill('#proxyUrl','https://mine.workers.dev/'); await pg.dispatchEvent('#proxyUrl','change');
 // 預設就是勾的，直接 check 不會觸發 change，設定也就不會被寫進去
 await pg.uncheck('#autoRegistry'); await pg.waitForTimeout(200);
 await pg.check('#autoRegistry'); await pg.waitForTimeout(300);
 const dump=await pg.evaluate(async()=>await window.Store.exportAll());
 chk(dump.settings&&dump.settings['registry-proxy-url']&&dump.settings['registry-proxy-url'].v==='https://mine.workers.dev/'&&dump.settings['registry-auto'].v==='1', `匯出的同步資料含設定：${JSON.stringify(dump.settings)}`);
 // 另一台（比較新）改了代理網址，同步回來要蓋過這台的
 const later=Date.now()+1000;
 const merged=await pg.evaluate(async(later)=>{const local=await window.Store.exportAll();
   const remote={version:2,records:[],logs:[],states:[],tombstones:{logs:{},sources:{},records:{}},settings:{'registry-proxy-url':{v:'https://other.workers.dev/',at:later},'registry-dataset-taxid-url':{v:'https://data.gcis.nat.gov.tw/od/data/api/NEWID',at:later},'registry-auto':{v:'',at:local.settings['registry-auto'].at-5000}}};
   const m=window.DriveSync.mergeDumps(local,remote); await window.Store.replaceAll(m);
   return {m:m.settings, proxy:window.Registry.getProxy(), tax:window.Registry.getTaxIdBase(), auto:localStorage.getItem('registry-auto')};},later);
 chk(merged.proxy==='https://other.workers.dev/', `另一台較新的代理網址同步過來並立刻生效：${merged.proxy}`);
 chk(merged.tax==='https://data.gcis.nat.gov.tw/od/data/api/NEWID', `資料集網址也同步：${merged.tax}`);
 chk(merged.auto==='1', `另一台較舊的「關閉自動更新」不會蓋掉這台較新的設定：${merged.auto}`);
 // 重新開設定視窗要看到同步過來的值
 await pg.keyboard.press('Escape'); await pg.click('#btnMenu'); await pg.click('[data-act="registry"]'); await pg.waitForSelector('#proxyUrl');
 chk((await pg.inputValue('#proxyUrl'))==='https://other.workers.dev/', '設定視窗顯示同步過來的代理網址');
 console.log('ERRORS:', errs.length?errs:'none'); console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
 await br.close(); srv.close(); process.exit(bad?1:0);
})();
