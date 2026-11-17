/*
 * 登記清冊歷期比對（版本 432，使用者「3、4都做」）：同一統編在留著的幾期變更清冊裡增資過幾期。
 * 結果寫進 leads/index.json 的 capitalUp：{ 統編: [期別, …] }，只留兩期以上的（成長型客戶的訊號），
 * 網站與後台讀 index.json 就有，手機不用把六期清冊全載下來。
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const UP_RE = /增資|發行新股/;   // 跟 assets/js/leads.js 的 REASONS 'up' 一樣

/** 一列 CSV 拆欄（欄位可能用雙引號包、含逗號、含換行以外的字元） */
export function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** 讀 outDir 底下各期的變更清冊，回 { 統編: [期別…] }（只留增資兩期以上的） */
export async function capitalUpIndex(outDir, periodsIndex) {
  const seen = new Map();
  for (const period of Object.keys(periodsIndex || {}).sort()) {
    for (const f of (periodsIndex[period].files || [])) {
      if (f.type !== 'change') continue;
      let text;
      try { text = await fs.readFile(path.join(outDir, f.path), 'utf8'); } catch (e) { continue; }
      const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
      const head = splitCsvLine(lines[0] || []);
      const ti = head.indexOf('統一編號'); const ri = head.indexOf('案由或變更事項');
      if (ti < 0 || ri < 0) continue;
      for (const line of lines.slice(1)) {
        const cells = splitCsvLine(line);
        const tax = String(cells[ti] || '').replace(/\D/g, '');
        if (tax.length !== 8 || !UP_RE.test(cells[ri] || '')) continue;
        if (!seen.has(tax)) seen.set(tax, new Set());
        seen.get(tax).add(period);
      }
    }
  }
  const out = {};
  [...seen.keys()].sort().forEach((t) => { const ps = [...seen.get(t)].sort(); if (ps.length >= 2) out[t] = ps; });
  return out;
}
