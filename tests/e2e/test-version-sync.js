/*
 * 版本號散在三個地方，任何一處對不上都會出事：
 *   - version.json 比程式新 → 更新提示無限迴圈（按了更新還是舊版，又跳提示）
 *   - index.html 的 ?v= 沒跟著換 → 使用者拿到快取的舊 js
 * 這種錯不會讓任何功能測試變紅，只能專門檢查。
 */
const fs=require('fs'), path=require('path');
const ROOT=require('path').resolve(__dirname,'../..');
const json=JSON.parse(fs.readFileSync(path.join(ROOT,'version.json'),'utf8')).version;
const app=(fs.readFileSync(path.join(ROOT,'assets/js/app.js'),'utf8')
  .match(/APP_VERSION\s*=\s*'([^']+)'/)||[])[1];
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const tags=[...html.matchAll(/\?v=([0-9A-Za-z.-]+)/g)].map(m=>m[1]);
const uniq=[...new Set(tags)];

let bad=0;
const check=(ok,msg)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${msg}`); };
check(!!json,`version.json 有版本號：${json}`);
check(!!app,`app.js 有 APP_VERSION：${app}`);
check(json===app,`version.json 與 APP_VERSION 相同（${json} vs ${app}）`);
check(tags.length>0,`index.html 的資源有帶 ?v=（${tags.length} 個）`);
check(uniq.length===1,`index.html 的 ?v= 全部一致：${JSON.stringify(uniq)}`);
check(uniq[0]===json,`index.html 的 ?v= 與 version.json 相同（${uniq[0]} vs ${json}）`);
console.log(bad?`\n${bad} 項失敗`:'\n全部通過');
process.exit(bad?1:0);
