const fs=require('fs'), vm=require('vm');
const store={}; const ctx={window:{},localStorage:{getItem:(k)=>store[k]||null,setItem:(k,v)=>{store[k]=v;},removeItem:(k)=>{delete store[k];}},console,URL,encodeURIComponent,decodeURIComponent,AbortSignal:{timeout:()=>null},fetch:()=>{}};
ctx.self=ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').resolve(__dirname,'../..')+'/assets/js/registry.js','utf8'),ctx); const R=ctx.window.Registry;
let bad=0; const chk=(ok,m)=>{ if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'} ${m}`); };
const t=R.officialByTaxId('28443147');
chk(t[0].startsWith('https://data.gcis.nat.gov.tw/od/data/api/7E6AFA72-AD6A-46D3-8681-ED77951D912D?$format=json&$filter=Business_Accounting_NO%20eq%2028443147')&&/236EE382/.test(t[1]), `統編優先用應用一 7E6AFA72，236EE382 當備援：${t[0]}`);
chk(t.every(u=>!/%24/.test(u)&&/\$format=json/.test(u)), '$ 照字面寫，不編碼成 %24');
chk(t.some(u=>/5F64D864/.test(u)&&/Company_Status%20eq%2001/.test(u)), '關鍵字資料集的備援寫法帶 Company_Status eq 01');
const n=R.officialByName('台灣積體電路製造股份有限公司');
chk(/5F64D864/.test(n[0])&&/Company_Name%20like%20/.test(n[0])&&/%20and%20Company_Status%20eq%2001&\$skip=0&\$top=5$/.test(n[0]), `名稱查詢第一種寫法帶 Company_Status eq 01：${n[0].slice(60)}`);
chk(n.length===14&&/%E8%87%BA/.test(n[7]), `台／臺 兩種寫法各七種查詢，共 14 條：${n.length}`);
// 統編（數字）查得到、公司名（字串）查不到，最大嫌疑是字串值要加單引號
chk(n.some(u=>/Company_Name%20like%20'/.test(u))&&n.some(u=>/Company_Name%20eq%20'/.test(u)), '有試加單引號的寫法');
chk(n.slice(0,4).every(u=>!/'/.test(u)), '文件上不加引號的寫法排在前面');
// 註解一直寫著「like 找不到再試 eq」，但程式裡曾經兩種寫法都是 like
chk(n.some(u=>/Company_Name%20eq%20/.test(u)&&/Company_Status%20eq%2001/.test(u))&&n.some(u=>/Company_Name%20eq%20/.test(u)&&!/Company_Status/.test(u)), 'like 之後真的有試 eq');
chk(n.slice(0,2).every(u=>/Company_Name%20like%20/.test(u)), 'like 還是排在 eq 前面');
chk(R.PROBE_TAXID==='22099131', '探路用台積電統編');
store['registry-proxy-url']='https://x.workers.dev/';
const via=R.SOURCES.proxy.byTaxId('28443147')[0];
chk(via.startsWith('https://x.workers.dev?url=https%3A%2F%2Fdata.gcis')&&R.upstreamOf(via)===t[0], `代理網址可拆回政府網址：${R.upstreamOf(via).slice(0,70)}…`);
chk(R.upstreamOf('https://x.workers.dev/?url=https%3A%2F%2Fevil.example%2F')==='https://x.workers.dev/?url=https%3A%2F%2Fevil.example%2F', '非政府網址不拆');
// g0v 鏡像網域、資料集網址整理、g0v 欄位攤平
chk(/^https:\/\/company\.g0v\.ronny\.tw\/api\/show\/12345678$/.test(R.SOURCES.g0v.byTaxId('12345678')[0])&&/company\.g0v\.ronny\.tw\/api\/search\//.test(R.SOURCES.g0v.byName('甲')[0]), 'g0v 鏡像用 company.g0v.ronny.tw');
chk(R.tidyDatasetUrl('ttps://data.gcis.nat.gov.tw/od/data/api/6BBA2268-1367-4B42-9CCA-BC17499EBE8C?$format=json').url==='https://data.gcis.nat.gov.tw/od/data/api/6BBA2268-1367-4B42-9CCA-BC17499EBE8C', '貼進來少了 h 的 ttps:// 會補回來、查詢參數去掉');
chk(R.tidyDatasetUrl('data.gcis.nat.gov.tw/od/data/api/ABC').url==='https://data.gcis.nat.gov.tw/od/data/api/ABC', '沒寫協定會補 https://');
chk(R.tidyDatasetUrl('https://example.com/x').ok===false, '不是 data.gcis 的網址會拒收');
store['registry-dataset-url']='ttps://data.gcis.nat.gov.tw/od/data/api/ZZZ';
chk(R.getBase()==='https://data.gcis.nat.gov.tw/od/data/api/ZZZ', '之前存壞的網址讀出來時也會修好');
const m=R.mapRow({'統一編號':'11111111','公司名稱':['甲公司','JIA'],'代表人姓名':'王','公司所在地':'新北市','資本總額(元)':'5000000','核准設立日期':{year:2016,month:3,day:1}});
chk(m.name==='甲公司'&&m.founded==='2016/03/01'&&m.capital==='5,000', `g0v 的陣列名稱與物件日期攤得平：${m.name} ${m.founded} ${m.capital}`);

console.log(bad?`\n${bad} 項失敗`:'\n全部通過'); process.exit(bad?1:0);
