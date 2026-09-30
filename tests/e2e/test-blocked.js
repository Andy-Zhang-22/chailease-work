const fs=require('fs'), vm=require('vm');
const ctx={window:{},document:{createElement:()=>({})},console}; ctx.self=ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').resolve(__dirname,'../..')+'/assets/js/normalize.js','utf8'), ctx);
const D=ctx.window.Normalize.detectBlocked;
const cases=[
 ['禁止推廣','115/09/01 老闆說禁止推廣',true],
 ['禁推簡寫','115/09/01 已註記禁推',true],
 ['不要再打','115/09/01 態度很差，說不要再打了',true],
 ['別再撥打','115/09/01 請別再撥打這支電話',true],
 ['勿再來電','115/09/01 勿再來電',true],
 ['請勿推銷','115/09/01 櫃檯說請勿推銷',true],
 ['打死不想','115/09/01 打死不想跟租賃往來',true],
 ['一般婉拒不算','115/09/01 目前沒有需求，之後再說',false],
 ['拒絕往來戶是信用狀況不是拒訪','115/09/01 銀行拒絕往來戶，票信有問題',false],
 ['黑名單指信用不是拒訪','115/09/01 老闆說他被列入黑名單',false],
 ['空白','',false],
];
let bad=0;
for(const [n,notes,want] of cases){
  const g=D(notes); const ok=g.blocked===want;
  if(!ok)bad++;
  console.log(`${ok?'PASS':'FAIL'}  ${n} → ${g.blocked}${ok?'':` 期望 ${want}`}${g.phrase?`（命中「${g.phrase}」）`:''}`);
}
console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
