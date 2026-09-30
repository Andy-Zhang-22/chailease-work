#!/usr/bin/env node
/*
 * 瀏覽器測試（Playwright）：依序跑 tests/e2e/test-*.js，每支自己開本機伺服器、塞假資料、驗畫面。
 *
 * 使用者問「還有什麼專業的建議讓我的系統更完善」，其中一項是把原本只在開發環境跑的瀏覽器測試搬進來，
 * 每次推上來都自動跑，改東西比較不會弄壞舊功能。這些測試只用假資料（搬進來前比對過，沒有任何客戶的公司名、
 * 電話、姓名），倉庫是公開的。
 *
 * 用法：
 *   npm run e2e                     全部
 *   npm run e2e -- --shard=2/4      分四組的第二組（CI 分組同時跑）
 *   npm run e2e -- test-biz.js      只跑某幾支
 * 需要 playwright：CI 會 npm i --no-save playwright 並裝 Chromium；本機可設 PW_CHROMIUM 指定瀏覽器位置。
 *
 * 判定：輸出有「FAIL 」那一行、或程式非 0 結束、或沒有「全部通過／全過」就算失敗（各測試的慣例）。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const shardArg = (args.find((a) => a.startsWith('--shard=')) || '').slice(8);
const only = args.filter((a) => !a.startsWith('--'));
let files = fs.readdirSync(__dirname).filter((f) => /^test-.*\.js$/.test(f)).sort();
if (only.length) files = files.filter((f) => only.includes(f));
if (shardArg) {
  const [i, n] = shardArg.split('/').map(Number);
  files = files.filter((_, k) => k % n === i - 1);
}
let failed = 0;
const started = Date.now();
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [f], { cwd: __dirname, encoding: 'utf8', timeout: 240000, env: process.env });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const fails = out.split('\n').filter((l) => /^FAIL /.test(l));
  const passed = r.status === 0 && !fails.length && /全部通過|全過/.test(out);
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (passed) { console.log(`✅ ${f}（${secs} 秒）`); continue; }
  failed += 1;
  console.log(`❌ ${f}（${secs} 秒）${r.error ? ` ${r.error.message}` : ''}`);
  console.log((fails.length ? fails.join('\n') : out.split('\n').slice(-25).join('\n')).replace(/^/gm, '    '));
}
console.log(`\n${files.length} 支，失敗 ${failed} 支，共 ${((Date.now() - started) / 60000).toFixed(1)} 分鐘`);
process.exit(failed ? 1 : 0);
