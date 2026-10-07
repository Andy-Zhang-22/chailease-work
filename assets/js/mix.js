/*
 * 「新名單」合併頁：登記清冊、動產擔保、出進口廠商、剛開始請人、剛開電子發票、新設工廠六份名單合在一起。
 *
 * 使用者：「這些找名單的分頁很多，有沒有辦法幫我全部匯總成一個分頁，同時又有各自名單的功能及更新頻率？」
 * →「除了上市櫃、商行維持獨立名單外，其餘都能合併」。
 *
 * 做法：六頁各自照舊（自己的篩選、加入名單、每月更新），這一頁把它們的候選依統編合成一家（app.js 的 mixCandidates，
 * 跟每日新名單同一套 mergeFeed 排序：訊號多的在前 → 最近買設備 → 成立 6～10 年 → 資本額 → 有電話 → 分公司遠近），
 * 卡片上寫每一份名單看到的那一句。名單裡已經有的、在各頁藏起來的、刪過的不列。
 * 篩選只留共用的幾組；各頁特有的（動保契約、清冊案由…）到那一頁看。
 */
(function (global) {
  'use strict';

  const PAGE = 60;
  const HIDDEN_KEY = 'mix-hidden-v1';
  let root = null;
  const $ = (sel) => root.querySelector(sel);
  const el = (tag, props, children) => {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => { if (k.includes('-')) n.setAttribute(k, v); else n[k] = v; });
    (children || []).forEach((c) => { if (c !== '' && c != null) n.append(c); });
    return n;
  };
  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const money = (n) => (global.Biz && global.Biz.money ? global.Biz.money(n) : String(n));
  const myBranch = () => { let b = ''; try { b = localStorage.getItem('my-branch') || ''; } catch (e) { /* 無痕 */ } return `${b || '新莊'}分公司`; };
  // 「最近買設備（2026/08）」「利率不敏感（跟和潤借）」這種括號裡是細節，篩選歸在同一條
  const sigKey = (s) => String(s || '').replace(/（[^）]*）$/, '');

  let items = [];
  let limit = PAGE;
  let loading = null;
  let status = [];
  const f = { src: new Set(), sig: new Set(), cond: new Set(), phone: new Set(), q: '' };
  let hidden = new Set();
  try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch (e) { hidden = new Set(); }
  const saveHidden = () => { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch (e) { /* 無痕 */ } };
  // 「這家不用了」跟六頁共用一份（依統編，app.js 的 srcHide）：這裡藏、那裡也藏
  const isHid = (it) => hidden.has(it.key) || (typeof global.srcHidden === 'function' && global.srcHidden(it.d.taxId));
  const hide = (it) => { if (it.d.taxId && typeof global.srcHide === 'function') global.srcHide(it.d.taxId); else { hidden.add(it.key); saveHidden(); } };
  const unhide = (it) => { hidden.delete(it.key); saveHidden(); if (typeof global.srcUnhide === 'function') global.srcUnhide(it.d.taxId); };

  /** 一家合併後要顯示的：電話、資本額、成立年、地址各取看得到的第一個（地址優先公司登記地，不用動保的標的物所在地） */
  function digest(it) {
    const pick = (fn) => { for (const x of it.facts) { const v = fn(x); if (v) return v; } return ''; };
    const addrFacts = [...it.facts.filter((x) => x.key !== 'ch'), ...it.facts.filter((x) => x.key === 'ch')];
    return {
      taxId: pick((x) => x.taxId), tel: pick((x) => x.tel), capital: Math.max(0, ...it.facts.map((x) => x.capital || 0)),
      years: (it.facts.find((x) => x.years != null) || {}).years, address: (addrFacts.find((x) => x.address) || {}).address || '',
      branchKey: pick((x) => x.branchKey),
    };
  }
  const COND = [
    ['branch', '我的分公司', (it) => it.d.branchKey === myBranch()],
    ['age', '成立 6～10 年', (it) => it.d.years != null && it.d.years >= 6 && it.d.years <= 10],
    ['cap', '資本額 500～6,000 萬', (it) => it.d.capital >= 5e6 && it.d.capital <= 6e7],
  ];
  /*
   * 電話篩選（使用者：「新增一個篩選，有電話、有手機、無電話」）：跟各頁一樣，籤是「或」的關係；
   * 手機算有電話的一種（只按「有手機」就只剩手機的）。
   */
  const isMobile = (tel) => /^0?9\d{8}$/.test(String(tel || '').replace(/\D/g, '').replace(/^886/, '0'));
  const phoneKinds = (it) => (it.d.tel ? (isMobile(it.d.tel) ? ['Y', 'M'] : ['Y']) : ['N']);
  const PHONE = [['Y', '有電話'], ['M', '有手機'], ['N', '沒電話']];
  function passes(it, except) {
    if (!showHidden && isHid(it)) return false;
    if (except !== 'src' && f.src.size && !it.facts.some((x) => f.src.has(x.key))) return false;
    if (except !== 'sig' && f.sig.size && !it.signals.some((s) => f.sig.has(sigKey(s)))) return false;
    if (except !== 'cond') for (const [k, , fn] of COND) if (f.cond.has(k) && !fn(it)) return false;
    if (except !== 'phone' && f.phone.size && !phoneKinds(it).some((k) => f.phone.has(k))) return false;
    const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every((t) => it.blob.includes(t));
  }
  let showHidden = false;

  function chips(host, options, set) {
    host.textContent = '';
    options.forEach(([value, label, count]) => {
      const b = el('button', { className: 'chip', type: 'button' }, [document.createTextNode(label), count != null ? el('small', { textContent: String(count) }) : '']);
      b.setAttribute('aria-pressed', String(set.has(value)));
      b.onclick = () => { if (set.has(value)) set.delete(value); else set.add(value); limit = PAGE; render(); };
      host.append(b);
    });
  }
  function drawChips() {
    const count = (except, pred) => items.filter((it) => pred(it) && passes(it, except)).length;
    chips($('#mix-fSrc'), (global.MIX_SOURCES || []).map((s) => [s.key, s.label, count('src', (it) => it.facts.some((x) => x.key === s.key))]), f.src);
    const sigs = new Map();
    items.forEach((it) => { if (passes(it, 'sig')) new Set(it.signals.map(sigKey)).forEach((s) => sigs.set(s, (sigs.get(s) || 0) + 1)); });
    f.sig.forEach((s) => { if (!sigs.has(s)) sigs.set(s, 0); });
    chips($('#mix-fSig'), [...sigs.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => [s, s, n]), f.sig);
    chips($('#mix-fPhone'), PHONE.map(([k, label]) => [k, label, count('phone', (it) => phoneKinds(it).includes(k))]), f.phone);
    chips($('#mix-fCond'), COND.map(([k, label, fn]) => [k, label, count('cond', fn)]), f.cond);
  }

  const findbiz = (taxId, text) => (taxId && global.Normalize && global.Normalize.findbizUrl
    ? el('a', { href: global.Normalize.findbizUrl(taxId, text), target: '_blank', rel: 'noopener', textContent: text, title: '商工登記公示資料（開新分頁）' })
    : el('span', { textContent: text }));
  const copyName = (name) => (typeof global.copyDot === 'function' ? global.copyDot(name, '複製公司名稱', `已複製：${name}`) : '');
  function card(it) {
    const d = it.d;
    const isHidden = isHid(it);
    const top = el('div', { className: 'card-top' }, [
      el('span', { className: 'card-name' }, [findbiz(d.taxId, it.name), copyName(it.name)]),
      ...it.signals.map((s) => el('span', { className: 'badge badge-up', textContent: s })),
      d.branchKey ? el('span', { className: 'badge badge-branch', textContent: d.branchKey }) : '',
    ]);
    const phone = el('div', { className: 'card-actions phone-search' }, [
      ...(d.tel ? [el('a', { className: 'tel', href: `tel:${d.tel.replace(/[^\d+#]/g, '')}`, textContent: `📞 ${d.tel}` }), typeof global.copyTel === 'function' ? global.copyTel(d.tel) : ''] : [el('span', { className: 'muted', textContent: '📞 沒電話' })]),
      ...(typeof global.phoneSearchLinks === 'function' ? global.phoneSearchLinks(it.name, d.address) : []),
    ]);
    const meta = el('div', { className: 'card-meta' }, [
      d.capital ? el('span', { textContent: `💰 資本額 ${money(d.capital)}` }) : el('span', { className: 'muted', textContent: '💰 資本額不明' }),
      d.years != null ? el('span', { textContent: `🎂 成立 ${d.years} 年` }) : el('span', { className: 'muted', textContent: '🎂 成立年不明' }),
      d.address ? el('span', { textContent: `📍 ${d.address}` }) : '',
      d.taxId ? el('span', { textContent: `#${d.taxId}` }) : '',
    ]);
    // 每一份名單看到的那一句；點來源名稱到那一頁
    const srcs = el('ul', { className: 'mix-srcs' }, it.facts.map((x) => el('li', {}, [
      el('button', { className: 'link-btn mix-src', type: 'button', textContent: x.label, title: `到「${x.label}」那一頁`, onclick: () => { if (typeof global.switchTab === 'function') global.switchTab(x.tab); } }),
      document.createTextNode(`：${x.info || ''}`),
    ])));
    const add = el('button', { className: 'btn btn-tiny btn-primary mix-add-one', type: 'button', textContent: '加入客戶名單' });
    add.onclick = async () => {
      add.disabled = true;
      try { await it.facts[0].add(); } finally { add.disabled = false; }
      await reload();
    };
    const actions = el('div', { className: 'card-actions' }, [add,
      isHidden ? el('button', { className: 'btn btn-tiny', type: 'button', textContent: '放回來', onclick: () => { unhide(it); render(); } })
        : el('button', { className: 'btn btn-tiny mix-hide', type: 'button', textContent: '這家不用了', onclick: () => { hide(it); render(); toast('藏起來了（七份名單一起藏）'); } })]);
    return el('article', { className: `card leads-card mix-card${d.branchKey === myBranch() ? ' is-up' : ''}${isHidden ? ' is-hidden' : ''}`, 'data-key': it.key }, [top, phone, meta, srcs, actions]);
  }

  let current = [];
  function render() {
    if (!root || !items) return;
    drawChips();
    current = items.filter((it) => passes(it, null));
    const host = $('#mix-cards');
    host.textContent = '';
    current.slice(0, limit).forEach((it) => host.append(card(it)));
    const multi = current.filter((it) => it.facts.length > 1).length;
    $('#mix-count').innerHTML = `符合 <b>${current.length.toLocaleString()}</b> 家<span class="muted">${multi ? `　／ 其中 ${multi} 家出現在兩份以上的名單` : ''}</span>`;
    $('#mix-more').hidden = current.length <= limit;
    $('#mix-empty').hidden = !!current.length;
    $('#mix-empty').textContent = items.length ? '沒有符合條件的，把篩選放寬試試。' : '七份名單都還沒載好或都已經在名單裡了。';
    const hid = items.filter(isHid).length;
    $('#mix-hidden').hidden = !hid;
    $('#mix-hidden').textContent = `${showHidden ? '收起' : '顯示'}藏起來的 ${hid} 家`;
    const pill = document.getElementById('countMix');
    if (pill) pill.textContent = current.length.toLocaleString();
  }
  function drawStatus() {
    const host = $('#mix-status');
    if (!host) return;
    host.textContent = '';
    host.append(el('strong', { textContent: '各份名單的更新：' }));
    status.forEach((s, i) => host.append(el('span', { textContent: `${i ? '・' : ''}${s.label} ${s.every}${s.at ? `（${s.at.replace(/-/g, '/')} 更新${s.extra ? `，${s.extra}` : ''}）` : s.err ? '（讀不到）' : ''}` })));
  }

  let seenVersion = -1;
  async function reload() {
    seenVersion = global.srcHiddenVersion || 0;
    $('#mix-loading').hidden = false;
    $('#mix-loading').textContent = '七份名單合併中…（第一次要下載各份資料，會久一點）';
    try {
      const got = typeof global.mixCandidates === 'function' ? await global.mixCandidates() : [];
      items = got.map((it) => { const d = digest(it); return { ...it, d, blob: [it.name, d.taxId, d.address, d.tel, ...it.signals, ...it.facts.map((x) => `${x.label} ${x.info || ''}`)].join(' ').toLowerCase() }; });
    } catch (err) { console.error(err); toast(`新名單合併失敗：${err.message}`); items = []; }
    $('#mix-loading').hidden = true;
    render();
  }

  function build() {
    root.textContent = '';
    const group = (label, node, forId) => el('div', { className: 'leads-group' }, [
      forId ? el('label', { htmlFor: forId, textContent: label }) : el('span', { className: 'lbl', textContent: label }), node]);
    const filters = el('details', { className: 'leads-filters', id: 'mix-filters' }, [
      el('summary', {}, [el('strong', { textContent: '篩選' })]),
      group('來源', el('div', { className: 'chips', id: 'mix-fSrc' })),
      group('訊號', el('div', { className: 'chips', id: 'mix-fSig' })),
      group('電話', el('div', { className: 'chips', id: 'mix-fPhone' })),
      group('條件（都要符合）', el('div', { className: 'chips', id: 'mix-fCond' })),
      group('關鍵字', el('input', { id: 'mix-q', type: 'search', placeholder: '名稱、統編、地址、電話、訊號', autocomplete: 'off' }), 'mix-q'),
      el('div', { className: 'leads-row' }, [
        el('button', { className: 'btn btn-tiny', id: 'mix-reset', type: 'button', textContent: '清除篩選' }),
        el('button', { className: 'btn btn-tiny', id: 'mix-hidden', type: 'button', hidden: true })]),
    ]);
    filters.open = (() => { try { return localStorage.getItem('leads-filters-open') === '1'; } catch (e) { return false; } })();
    root.append(
      filters,
      el('div', { className: 'leads-head' }, [el('div', { className: 'leads-count', id: 'mix-count', textContent: '—' })]),
      el('div', { className: 'leads-loading', id: 'mix-loading', hidden: true }),
      el('div', { className: 'cards', id: 'mix-cards' }),
      el('div', { className: 'empty', id: 'mix-empty', hidden: true }),
      el('div', { className: 'leads-row leads-more' }, [el('button', { className: 'btn', id: 'mix-more', type: 'button', textContent: '載入更多', hidden: true })]),
      // 各份名單的更新收成一行，點了才展開（畫面瘦身；上面那段說明也拿掉了）
      el('details', { className: 'leads-foot mix-status-box' }, [
        el('summary', { className: 'muted', textContent: '資料更新狀態' }),
        el('p', { className: 'muted mix-status', id: 'mix-status' })]),
    );
    let qt = null;
    $('#mix-q').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { f.q = e.target.value; limit = PAGE; render(); }, 120); };
    $('#mix-more').onclick = () => { limit += PAGE; render(); };
    $('#mix-hidden').onclick = () => { showHidden = !showHidden; limit = PAGE; render(); };
    $('#mix-reset').onclick = () => { f.src.clear(); f.sig.clear(); f.cond.clear(); f.phone.clear(); f.q = ''; $('#mix-q').value = ''; showHidden = false; limit = PAGE; render(); };
  }

  function show() {
    if (!root) root = document.getElementById('paneMix');
    if (!root) return;
    if (!loading) {
      build();
      loading = reload();
      if (typeof global.mixSourceStatus === 'function') global.mixSourceStatus().then((s) => { status = s; drawStatus(); }).catch(() => {});
      return;
    }
    if ((global.srcHiddenVersion || 0) !== seenVersion) { loading = reload(); return; }
    render();
  }
  global.Mix = { show, reload: () => (root ? reload() : Promise.resolve()) };
})(window);
