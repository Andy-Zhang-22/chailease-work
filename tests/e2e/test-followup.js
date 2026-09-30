const fs=require('fs'), vm=require('vm');
const ctx={window:{},document:{createElement:()=>({})},console}; ctx.self=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').resolve(__dirname,'../..')+'/assets/js/normalize.js','utf8'), ctx);
const F=ctx.window.Normalize.findFollowUp;
const TODAY='2026-09-16';
const cases=[
 ['內文寫民國全日期','115/09/01 老闆說115/10/15再聯絡','2026-10-15'],
 ['內文只寫月日','115/09/01 約10/20再拜訪','2026-10-20'],
 ['跨年度的月日','115/12/20 約1/5再談','2027-01-05'],
 ['沒有約訪字眼就不猜','115/09/01 本餘980萬，利率2.5/3.0',null],
 ['日期在過去不採用','115/09/01 上次8/1有拜訪過',null],
 ['取最新一則的判讀','115/03/01 約4/1再聯絡\n115/09/10 改約11/5再拜訪','2026-11-05'],
 ['同一則有多個未來日取最早','115/09/01 10/20或11/30再約','2026-10-20'],
 ['太遠的不採用(超過一年半)','115/09/01 約2030/1/1再聯絡',null],
 ['開頭的訪談日不會被當成下次','115/10/01 已聯絡',null],
 ['空白','',null],
];
let bad=0;
for(const [name,notes,want] of cases){
  const got=F(notes,TODAY);
  const val=got?got.iso:null;
  const ok=val===want;
  if(!ok)bad++;
  console.log(`${ok?'PASS':'FAIL'}  ${name}  → ${val}${ok?'':`  期望 ${want}`}${got?`  「${got.snippet}」`:''}`);
}
console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
