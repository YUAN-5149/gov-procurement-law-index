/* 政府採購法令彙編 · 學習索引網站
   資料來源：全國法規資料庫（法務部）— 見 data.js meta
   ------------------------------------------------------------------ */
(function () {
'use strict';

const D = window.LAW;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ================== 中文數字 → 阿拉伯數字 ================== */
const CN = {'〇':0,'零':0,'一':1,'二':2,'兩':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
function cn2n(s) {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  s = String(s);
  let total = 0, section = 0, num = 0;
  for (const ch of s) {
    if (ch in CN) { num = CN[ch]; }
    else if (ch === '十') { section += (num || 1) * 10; num = 0; }
    else if (ch === '百') { section += (num || 1) * 100; num = 0; }
    else if (ch === '千') { section += (num || 1) * 1000; num = 0; }
    else if (ch === '萬') { total += (section + num) * 10000; section = 0; num = 0; }
    else if (/\d/.test(ch)) { num = num * 10 + (+ch); }
  }
  return total + section + num;
}

/* ================== 建立索引 ================== */
const LAWS = D.laws;
const LAWBY = {};
LAWS.forEach(l => { LAWBY[l.id] = l; l.artBy = {}; l.articles.forEach(a => { a.lid = l.id; l.artBy[a.no] = a; }); });

const IDX = [];
LAWS.forEach(l => l.articles.forEach(a => {
  const text = a.lines.join('\n');
  IDX.push({ lid: l.id, lt: l.title, ls: l.short || l.title, no: a.no, label: a.label,
             ch: a.ch || '', cat: a.cat, cats: [a.cat].concat(a.xc || []),
             text, key: (l.title + ' ' + a.label + ' ' + text) });
}));

/* 條文互引：抓出「本法第○條」「第○條之○」等 → 建立正向 / 反向索引 */
const REFRE = /(政府採購法施行細則|本法施行細則|施行細則|政府採購法|採購法|本法|本細則|本辦法|本準則|本規則|本標準|本要點|本要項)?第\s*([一二三四五六七八九十百零〇\d]+)\s*條(?:\s*之\s*([一二三四五六七八九十\d]+))?/g;
const REV = {};        // 'A0030057#50' -> [{lid,no,label,lt}]
const DETAIL_PREFIX = ['政府採購法施行細則', '本法施行細則', '施行細則'];
function refTarget(prefix, selfLid) {
  if (DETAIL_PREFIX.indexOf(prefix) >= 0) return 'A0030058';
  if (prefix === '本法' || prefix === '政府採購法' || prefix === '採購法') return 'A0030057';
  if (prefix) return selfLid;              // 本細則/本辦法…
  return selfLid;                          // 無前綴 → 同法
}
LAWS.forEach(l => l.articles.forEach(a => {
  const seen = new Set();
  REFRE.lastIndex = 0; let m;
  const body = a.lines.join('\n');
  while ((m = REFRE.exec(body))) {
    const tl = refTarget(m[1], l.id);
    const n = cn2n(m[2]) + (m[3] ? '-' + cn2n(m[3]) : '');
    const key = tl + '#' + n;
    if (seen.has(key)) continue;
    seen.add(key);
    if (tl === l.id && String(n) === String(a.no)) continue;
    (REV[key] = REV[key] || []).push({ lid: l.id, no: a.no, label: a.label, lt: l.title, ls: l.short || l.title });
  }
}));

const inCat = (a, cid) => a.cat === cid || (a.xc || []).indexOf(cid) >= 0;

/* ================== 狀態 ================== */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('gpa.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('gpa.' + k, JSON.stringify(v)); } catch (e) {} }
};
let marks = new Set(LS.get('marks', []));
const saveMarks = () => LS.set('marks', Array.from(marks));

/* ---------- 題目穩定識別碼 ----------
   練習紀錄若以「題目在陣列中的位置」當 key，題庫一旦插入或重排，
   所有人的錯題本與複習排程就會整批對到別題。改以題目內容雜湊當 key。 */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const QID = D.quiz.map(q => 'q' + hash32(q.r + '|' + q.q));
const QIDX = {}; QID.forEach((id, i) => { if (QIDX[id] == null) QIDX[id] = i; });

/* 舊版（索引為 key）紀錄一次性搬遷 */
(function migrateQStat() {
  if (LS.get('qstat.v', 0) >= 2) return;
  const old = LS.get('qstat', null);
  if (old && typeof old === 'object') {
    const nx = {};
    Object.keys(old).forEach(k => {
      const i = Number(k);
      if (Number.isInteger(i) && QID[i]) nx[QID[i]] = old[k];   // 舊索引 → 新 id
      else if (!Number.isInteger(i)) nx[k] = old[k];            // 已是新 id
    });
    LS.set('qstat', nx);
  }
  LS.set('qstat.v', 2);
})();

/* ---------- Leitner 間隔重複：所有卡片共用 ---------- */
const SRS_DAY = 86400000;
const SRS_GAP = [0, 1, 3, 7, 21];          // box 1~5 對應的間隔天數
function boxDue(store, k, now) {
  const st = store[k];
  if (!st) return true;                     // 沒做過＝該做
  return (st.due || 0) <= (now || Date.now());
}
function boxRecord(store, k, ok) {
  const now = Date.now();
  const st = store[k] || { n: 0, w: 0, box: 1 };
  st.n++; st.last = now;
  if (ok) st.box = Math.min(5, (st.box || 1) + 1);
  else { st.w++; st.box = 1; }
  st.due = now + SRS_GAP[st.box - 1] * SRS_DAY;
  store[k] = st;
  return st;
}
function boxStats(store, keys) {
  const now = Date.now();
  let done = 0, wrong = 0, due = 0, mastered = 0;
  keys.forEach(k => {
    const st = store[k];
    if (!st) { due++; return; }
    done++;
    if (st.w > 0 && st.box < 5) wrong++;
    if (st.box >= 5) mastered++;
    if (boxDue(store, k, now)) due++;
  });
  return { total: keys.length, done, wrong, due, mastered, untouched: keys.length - done };
}

/* ---------- 學習紀錄匯出／匯入（換手機、清快取都不會消失） ---------- */
const BACKUP_TAG = 'gov-procurement-law-index';
function exportProgress() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf('gpa.') === 0) data[k] = localStorage.getItem(k);
  }
  const dump = { app: BACKUP_TAG, v: 1, at: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '採購法學習紀錄-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function importProgress(file, done) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const dump = JSON.parse(rd.result);
      if (!dump || dump.app !== BACKUP_TAG || !dump.data) throw new Error('格式不符');
      const n = Object.keys(dump.data).length;
      if (!confirm('將以備份檔覆蓋這個瀏覽器目前的學習紀錄（' + n + ' 項，含標記、錯題本、複習排程、讀書計畫）。確定匯入？')) return;
      Object.keys(dump.data).forEach(k => {
        if (k.indexOf('gpa.') === 0) localStorage.setItem(k, dump.data[k]);
      });
      done && done(null, n);
    } catch (e) { done && done(e); }
  };
  rd.onerror = () => done && done(new Error('讀不到檔案'));
  rd.readAsText(file);
}

const S = { view: document.documentElement.dataset.start === 'accept' ? 'dg' : 'home', lid: null, cat: null, anchor: null, q: '', scope: 'all', open: {} };

/* ================== 搜尋 ================== */
const NUMONLY = /^第?\s*([一二三四五六七八九十百零〇\d]+)\s*(?:條)?(?:\s*之\s*([一二三四五六七八九十\d]+))?\s*$/;

function tokenize(q) {
  return q.trim().split(/[\s,，、]+/).filter(Boolean);
}
function scopeFilter(rec) {
  if (S.scope === 'law' && S.lid) return rec.lid === S.lid;
  if (S.scope === 'cat' && S.cat) return rec.cats.indexOf(S.cat) >= 0;
  if (S.scope === 'mark') return marks.has(rec.lid + '#' + rec.no);
  return true;
}
function search(q) {
  const out = [];
  const nm = q.trim().match(NUMONLY);
  let wantNo = null;
  if (nm) wantNo = cn2n(nm[1]) + (nm[2] ? '-' + cn2n(nm[2]) : '');
  const terms = tokenize(q);
  IDX.forEach(rec => {
    if (!scopeFilter(rec)) return;
    let score = 0, hit = false;
    if (wantNo != null && String(rec.no) === String(wantNo)) { score += 1000; hit = true; }
    if (terms.length) {
      let all = true, sc = 0;
      for (const t of terms) {
        const inTx = rec.text.indexOf(t);
        const inTi = rec.lt.indexOf(t);
        const inNo = rec.label.indexOf(t);
        if (inTx < 0 && inTi < 0 && inNo < 0) { all = false; break; }
        if (inTx >= 0) { sc += 10 + Math.max(0, 6 - Math.floor(inTx / 40));
          let c = 0, i = 0; while ((i = rec.text.indexOf(t, i)) >= 0) { c++; i += t.length; }
          sc += Math.min(c, 8); }
        if (inTi >= 0) sc += 14;
        if (inNo >= 0) sc += 6;
      }
      if (all) { score += sc; hit = true; }
    }
    if (!hit) return;
    if (rec.lid === 'A0030057') score += 6;
    if (rec.lid === 'A0030058') score += 3;
    out.push({ rec, score, terms, wantNo });
  });
  out.sort((a, b) => b.score - a.score || a.rec.lid.localeCompare(b.rec.lid) || cn2n(String(a.rec.no)) - cn2n(String(b.rec.no)));
  return out;
}
function snippet(text, terms) {
  let pos = -1;
  for (const t of terms) { const i = text.indexOf(t); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  if (pos < 0) return text.slice(0, 150);
  const s = Math.max(0, pos - 18);
  return (s > 0 ? '…' : '') + text.slice(s, s + 200);
}
function hl(str, terms) {
  const S1 = String.fromCharCode(1), S2 = String.fromCharCode(2);
  let h = esc(str);
  (terms || []).filter(Boolean).sort((x, y) => y.length - x.length).forEach(t => {
    const te = esc(t);
    if (!te) return;
    let out = '', i = 0;
    for (;;) {
      const j = h.indexOf(te, i);
      if (j < 0) { out += h.slice(i); break; }
      out += h.slice(i, j) + S1 + te + S2;
      i = j + te.length;
    }
    h = out;
  });
  return h.split(S1).join('<mark>').split(S2).join('</mark>');
}

/* ================== 條文渲染 ================== */
function linkRefs(htmlStr, selfLid) {
  return htmlStr.replace(REFRE, (full, pre, n1, n2) => {
    const tl = refTarget(pre, selfLid);
    const n = cn2n(n1) + (n2 ? '-' + cn2n(n2) : '');
    if (!LAWBY[tl] || !LAWBY[tl].artBy[n]) return full;
    return `<a class="xref" href="#/law/${tl}/${n}" data-go="${tl}#${n}">${full}</a>`;
  });
}
function artHTML(a, terms) {
  const l = LAWBY[a.lid];
  const key = a.lid + '#' + a.no;
  const isM = marks.has(key);
  const multi = a.lines.length > 1 && !a.mono;
  const body = a.mono
    ? `<pre class="mono">${esc(a.lines.join(String.fromCharCode(10)))}</pre>`
    : a.lines.map((ln, i) => {
    let t = terms && terms.length ? hl(ln, terms) : esc(ln);
    t = linkRefs(t, a.lid).replace(/\n/g, '<br>');
    return `<p class="${multi ? 'num' : ''}" ${multi ? `data-n="${i + 1}"` : ''}>${t}</p>`;
  }).join('');
  const rel = REV[key] || [];
  const relHTML = rel.length ? `<div class="relbar"><span class="rl">相關條文</span>` +
    rel.slice(0, 14).map(r => `<a class="relchip" href="#/law/${r.lid}/${r.no}" data-go="${r.lid}#${r.no}">${esc(r.ls)} ${esc(r.label)}</a>`).join('') +
    (rel.length > 14 ? `<span class="rl">…共 ${rel.length} 條</span>` : '') + `</div>` : '';
  return `<article class="art${isM ? ' marked' : ''}" id="a-${a.lid}-${a.no}" data-key="${key}">
    <div class="arthd">
      <span class="artno">${esc(a.label)}</span>
      ${a.ch ? `<span class="artch">${esc(a.ch)}</span>` : ''}
      ${S.view === 'search' || S.view === 'cat' ? `<span class="artch">${esc(l.short || l.title)}</span>` : ''}
      <span class="artacts">
        <button class="iact${isM ? ' act' : ''}" data-mark="${key}" title="標記為重點">${isM ? '★' : '☆'}</button>
        <button class="iact" data-copy="${key}" title="複製條文">⧉</button>
      </span>
    </div>
    <div class="artbody">${body}</div>${relHTML}${lettersForArticle(a)}</article>`;
}

/* ================== 導覽列 ================== */
function buildNav() {
  const wrap = $('#nav');
  const byCat = {};
  D.cats.forEach(c => byCat[c.id] = []);
  LAWS.forEach(l => {
    const cs = new Set(); l.articles.forEach(a => { cs.add(a.cat); (a.xc || []).forEach(x => cs.add(x)); });
    cs.forEach(c => { if (byCat[c]) byCat[c].push(l); });
  });
  wrap.innerHTML = `<button class="navcat" data-home="1" style="margin-bottom:8px">
      <span class="ci">⌂</span><span class="cn">首頁 · 使用說明</span></button>` +
    D.cats.map(c => {
      const laws = byCat[c.id] || [];
      const n = IDX.filter(r => r.cats.indexOf(c.id) >= 0).length;
      return `<div class="navsec">
        <button class="navcat" data-cat="${c.id}">
          <span class="ci">${c.code}</span><span class="cn">${esc(c.name)}</span><span class="cc">${n}</span>
        </button>
        <div class="navlaws hidden" data-laws="${c.id}">
          ${laws.map(l => `<button class="navlaw" data-law="${l.id}" data-lcat="${c.id}">${esc(l.title)}</button>`).join('')}
        </div></div>`;
    }).join('') +
    `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
      <button class="navcat" data-view="plan"><span class="ci">計</span><span class="cn">讀書計畫</span><span class="cc" id="planN"></span></button>
      <button class="navcat" data-view="journey"><span class="ci">路</span><span class="cn">採購旅程 · 圖像記憶</span></button>
      <button class="navcat" data-view="dg"><span class="ci">圖</span><span class="cn">圖解流程</span></button>
      <button class="navcat" data-view="lt"><span class="ci">釋</span><span class="cn">工程會解釋函令</span><span class="cc">${LT_COUNT}</span></button>
      <button class="navcat" data-view="memo"><span class="ci">記</span><span class="cn">重點速記卡</span></button>
      <button class="navcat" data-view="cmp2"><span class="ci">比</span><span class="cn">易混淆概念比較</span></button>
      <button class="navcat" data-view="cmp"><span class="ci">⇄</span><span class="cn">母法／細則對照表</span></button>
      <button class="navcat" data-view="quiz"><span class="ci">?</span><span class="cn">自我測驗（選擇題）</span></button>
      <button class="navcat" data-view="exam"><span class="ci">◷</span><span class="cn">模擬考</span></button>
      <button class="navcat" data-view="calc"><span class="ci">算</span><span class="cn">金額與期限試算</span></button>
      <button class="navcat" data-view="marks"><span class="ci">★</span><span class="cn">我的重點</span><span class="cc" id="markN">${marks.size}</span></button>
     </div>
     <div style="margin-top:14px;padding:10px;font-size:10.5px;line-height:1.9;color:var(--ink3);
       background:var(--bg);border-radius:8px">
       <b style="color:var(--ink2)">資料來源</b><br>${esc(D.meta.source)}<br>擷取日期 ${esc(D.meta.generated)}<br>
       共 ${LAWS.length} 部法規 · ${IDX.length} 條
     </div>`;
}
function syncNav() {
  $$('.navcat').forEach(b => b.classList.remove('on'));
  $$('.navlaw').forEach(b => b.classList.remove('on'));
  $$('[data-laws]').forEach(d => d.classList.add('hidden'));
  if (S.view === 'cat' || S.view === 'law') {
    const c = S.cat;
    if (c) {
      const btn = $(`.navcat[data-cat="${c}"]`); if (btn) btn.classList.add('on');
      const box = $(`[data-laws="${c}"]`); if (box) box.classList.remove('hidden');
    }
    if (S.lid) { const lb = $(`.navlaw[data-law="${S.lid}"][data-lcat="${S.cat}"]`); if (lb) lb.classList.add('on'); }
  } else if (S.view === 'home') { const b = $('[data-home]'); if (b) b.classList.add('on'); }
  else { const b = $(`.navcat[data-view="${S.view}"]`); if (b) b.classList.add('on'); }
  const mn = $('#markN'); if (mn) mn.textContent = marks.size;
  const pn = $('#planN');
  if (pn) {
    const plan = PLAN_DEFS[PL.id] || PLAN_DEFS.d30, dn = planDone();
    pn.textContent = plan.days.filter((_, i) => dn[planKey(PL.id, i)]).length + '/' + plan.days.length;
  }
}

/* ================== 各視圖 ================== */
function viewHome() {
  const stats = D.cats.map(c => ({ c, n: IDX.filter(r => r.cats.indexOf(c.id) >= 0).length }));
  return `<div class="journey-hero"><small>從理解到記憶</small><h2>讓法條在腦中，有一個位置。</h2><p>用六個場景串起採購程序，再用比較與回想把觀念記牢。</p><button class="journey-start" data-view="journey">開始六站圖像學習 →</button></div>
  <div class="toolgrid">
    <button class="toolcard" data-view="plan"><h4>① 跟著讀書計畫走　${planPct()}%</h4>
      <p>30 天完整讀一輪，或 7 天考前衝刺。每天指定「讀哪一段 → 看哪張表 → 練幾題」，不必自己想今天要幹嘛。</p></button>
    <button class="toolcard" data-view="quiz"><h4>② 今天該複習 ${srsStats().due} 題</h4>
      <p>答對往後排 1→3→7→21 天，答錯歸零；錯題自動收進錯題本，並把該條加入我的重點。</p></button>
    <button class="toolcard" data-view="exam"><h4>③ 用模擬考檢查成果</h4>
      <p>30／50／80 題計時作答，一次交卷，附八大分類弱點分析與逐題檢討。</p></button>
    <button class="toolcard" data-view="calc"><h4>④ 金額與期限算給你看</h4>
      <p>輸入金額得到級距、等標期與該做的事；輸入日期得到異議、申訴、驗收的到期日，每個結果都附法源。</p></button>
  </div>
  <div class="crumb">首頁</div>
  <div class="lawhead"><h2>政府採購法令彙編 · 學習索引</h2>
    <div class="lawmeta">
      <span><b>${LAWS.length}</b> 部法規</span><span><b>${IDX.length}</b> 條條文</span>
      <span>資料來源：${esc(D.meta.source)}</span><span>擷取日期：${esc(D.meta.generated)}</span>
    </div></div>

  <div class="grid g2">
    <div class="card"><h3><span class="dot"></span>怎麼查</h3>
      <p class="hint">上方搜尋框同時支援三種查法，輸入即時出結果。</p>
      <table class="t"><tbody>
        <tr><td class="k">關鍵字</td><td>輸入 <code>押標金</code>、<code>最有利標</code>，跨全部 ${LAWS.length} 部法規全文比對並標黃。</td></tr>
        <tr><td class="k">多關鍵字</td><td>用空白分隔，如 <code>異議 申訴 期限</code>，須全部命中（AND）。</td></tr>
        <tr><td class="k">條號直達</td><td>輸入 <code>50</code>、<code>第50條</code>、<code>101</code>，直接列出各法規同條號條文。</td></tr>
      </tbody></table>
      <div class="mnemo"><div class="lb">快捷鍵</div>
        <p><b>Ctrl / ⌘ + K</b> 聚焦搜尋　·　<b>/</b> 聚焦搜尋　·　<b>Esc</b> 清除搜尋　·　<b>↑</b> 回頂端</p></div>
    </div>

    <div class="card"><h3><span class="dot"></span>怎麼記</h3>
      <p class="hint">依採購流程八大分類編排，母法、施行細則與子法在同一分類下並列，可對照記憶。</p>
      <div class="tablewrap"><table class="t"><tbody>
      ${stats.map(s => `<tr><td class="k"><button class="ref" data-cat="${s.c.id}">${s.c.code} ${esc(s.c.name)}</button></td>
        <td>${esc(s.c.desc || '')}<span style="color:var(--ink3)"> （${s.n} 條）</span></td></tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="card"><h3><span class="dot"></span>九個學習工具</h3>
      <p class="hint">先看圖建立骨架，再用表格與題目補細節，最後用函釋看實務怎麼認定。</p>
      <table class="t"><tbody>
        <tr><td class="k"><button class="ref" data-view="plan">讀書計畫</button></td>
            <td>30 天完整版與 7 天衝刺版，每天指定條文範圍、對應的速記卡與流程圖，並只出<b>那一段</b>的題目。進度存在瀏覽器。</td></tr>
        <tr><td class="k"><button class="ref" data-view="exam">模擬考</button></td>
            <td>30／50／80 題計時作答，作答時不給答案，交卷後才出成績單：分類得分條、弱點提示與逐題檢討，答錯的題目自動進錯題本。</td></tr>
        <tr><td class="k"><button class="ref" data-view="calc">金額與期限試算</button></td>
            <td>輸入採購金額與招標方式，算出級距、等標期（含 §9 縮短步驟）與跨級距後多出的義務；另可算異議、申訴、驗收與付款期限。每個結果都附條文連結。</td></tr>
        <tr><td class="k"><button class="ref" data-view="dg">圖解流程</button></td>
            <td>${D.diagrams.length} 張手繪流程圖：金額級距、招標決策樹、等標期、比減價格、驗收時程、爭議雙軌、停權流程、組織關係、GPA 判斷。瀏覽各分類時也會出現在最上方。</td></tr>
        <tr><td class="k"><button class="ref" data-view="memo">重點速記卡</button></td>
            <td>${D.memo.length} 張高頻考點整併表：金額級距、招標方式、§22 十六款、等標期、比減價、保證金、驗收期限、停權、罰則、GPA。每格都可點回原條文。</td></tr>
        <tr><td class="k"><button class="ref" data-view="cmp2">易混淆概念比較</button></td>
            <td>${D.compare.length} 組並排比較表：異議/申訴/調解/仲裁、轉包/分包、四種保證金、廢標/不予開標/不決標、初驗/驗收/減價收受、五個小組等。</td></tr>
        <tr><td class="k"><button class="ref" data-view="cmp">母法／細則對照表</button></td>
            <td>依程式自動解析「本法第○條」引用關係，列出母法每一條對應的施行細則、子法條文，以及工程會函釋則數。</td></tr>
        <tr><td class="k"><button class="ref" data-view="lt">工程會解釋函令</button></td>
            <td>${LT_COUNT} 則函釋索引，對應 ${Object.keys(LBYART).length} 個採購法條號。可依條號篩選或搜尋主旨與發文字號；全文連回政府電子採購網。</td></tr>
        <tr><td class="k"><button class="ref" data-view="quiz">自我測驗</button></td>
            <td><b>${D.quiz.length} 題選擇題</b>（附詳解與條文連結）＋ 條號翻牌卡；可限定分類或只考已標記的重點。</td></tr>
      </tbody></table>
      <div class="mnemo"><div class="lb">標記重點</div>
        <p>任一條文右上角 <b>☆</b> 可標記；標記後左側出現金色標線，並可用搜尋範圍「★ 我的重點」只搜自己標的條文，測驗也能只考標記過的。</p></div>
    </div>

    <div class="card"><h3><span class="dot"></span>條文互相連結</h3>
      <p class="hint">條文中出現的「本法第○條」「第○條」皆為<span class="xref" style="border-bottom:1px dashed">可點連結</span>，直接跳到該條。</p>
      <p class="hint">每條下方的「相關條文」列出<b>反向引用</b>——也就是有哪些細則、子法條文引用了這一條，這是把母法與子法串起來記憶的關鍵。</p>
      <p class="hint" style="margin-top:12px"><b>收錄範圍</b>：政府採購法、施行細則、
        ${LAWS.filter(l => l.kind === '子法').length} 部授權子法，以及工程會訂頒之
        <b>${LAWS.filter(l => ['行政規則', '令函釋示', '函頒'].indexOf(l.kind) >= 0).length} 份</b>
        作業規定、要點、須知、令函釋示與《政府採購錯誤行為態樣》，
        依採購流程分入八大分類，法規名稱旁以「工程會訂頒」標示。</p>
      <div class="note">${esc(D.meta.note)}</div>
    </div>

    <div class="card"><h3><span class="dot"></span>你的學習紀錄</h3>
      <p class="hint">標記、錯題本、複習排程、讀書計畫進度都存在<b>這個瀏覽器</b>，不會上傳。
        換手機、換電腦或清除瀏覽資料前，記得先匯出備份。</p>
      <table class="t"><tbody>
        <tr><td class="k">★ 我的重點</td><td><b>${marks.size}</b> 條　<button class="ref" data-view="marks">查看 →</button></td></tr>
        <tr><td class="k">選擇題</td><td>已練 <b>${srsStats().done}</b> / ${D.quiz.length}　·　熟練 <b>${srsStats().mastered}</b>　·　錯題 <b>${srsStats().wrong}</b>　·　待複習 <b>${srsStats().due}</b></td></tr>
        <tr><td class="k">讀書計畫</td><td>${esc((PLAN_DEFS[PL.id] || PLAN_DEFS.d30).name)}　完成 <b>${planPct()}%</b>　<button class="ref" data-view="plan">繼續 →</button></td></tr>
        <tr><td class="k">模擬考</td><td>${(LS.get('exam.log', []).length ? '最近一次 <b>' + Math.round(LS.get('exam.log', [])[0].right / LS.get('exam.log', [])[0].n * 100) + '</b> 分' : '尚未考過')}　<button class="ref" data-view="exam">開始 →</button></td></tr>
      </tbody></table>
      <div class="backup">
        <button class="tbtn" id="btnExport">⇩ 匯出備份（JSON）</button>
        <button class="tbtn" id="btnImport">⇧ 匯入備份</button>
        <input type="file" id="fileImport" accept="application/json,.json">
      </div>
      <div class="note">匯入會<b>覆蓋</b>這個瀏覽器目前的紀錄。備份檔只有你自己的練習資料，不含法規內容。</div>
    </div>
  </div>`;
}

function planPct() {
  const plan = PLAN_DEFS[PL.id] || PLAN_DEFS.d30, dn = planDone();
  return Math.round(plan.days.filter((_, i) => dn[planKey(PL.id, i)]).length / plan.days.length * 100);
}

function viewLaw(lid, catFilter) {
  const l = LAWBY[lid];
  if (!l) return `<div class="empty"><h3>找不到法規</h3></div>`;
  let arts = l.articles;
  if (catFilter && l.multi) arts = arts.filter(a => inCat(a, catFilter));
  let out = '', lastCh = null;
  arts.forEach(a => {
    if (a.ch && a.ch !== lastCh) { out += `<div class="chdiv"><h3>${esc(a.ch)}</h3><div class="ln"></div></div>`; lastCh = a.ch; }
    out += artHTML(a, null);
  });
  const cat = D.cats.find(c => c.id === (catFilter || l.articles[0].cat));
  return `<div class="crumb">${cat ? esc(cat.name) + ' › ' : ''}<b>${esc(l.title)}</b></div>
  <div class="lawhead"><h2>${esc(l.title)}</h2>
    <div class="lawmeta">
      <span class="pill ${l.kind === '母法' ? 'r' : l.kind === '施行細則' ? 'b' : ''}">${esc(l.kind)}</span>
      ${l.id.startsWith('FL') ? '<span class="pill b">工程會訂頒</span>' : ''}
      ${l.date ? `<span>修正/發布日期：<b>${esc(l.date)}</b></span>` : ''}
      <span>共 <b>${l.articles.length}</b> 條${catFilter && l.multi ? `（本分類 ${arts.length} 條）` : ''}</span>
      <span><a href="${l.url}" target="_blank" rel="noopener" class="ref">全國法規資料庫原文 ↗</a></span>
    </div></div>${out || '<div class="empty"><h3>本分類無條文</h3></div>'}`;
}

function viewCat(cid) {
  const c = D.cats.find(x => x.id === cid);
  const laws = LAWS.filter(l => l.articles.some(a => inCat(a, cid)));
  const core = laws.filter(l => l.id === 'A0030057' || l.id === 'A0030058');
  const subs = laws.filter(l => l.id !== 'A0030057' && l.id !== 'A0030058');
  let out = `<div class="crumb">分類</div>
   <div class="lawhead"><h2>${c.code}　${esc(c.name)}</h2>
     <div class="lawmeta"><span>${esc(c.desc || '')}</span>
     <span>共 <b>${IDX.filter(r => r.cats.indexOf(cid) >= 0).length}</b> 條</span></div></div>`;

  const dg = D.diagrams.find(x => x.cat === cid);
  if (dg) out += dgCard(dg, true);

  if (c.intro) out += `<div class="card" style="margin-bottom:16px"><h3><span class="dot"></span>本章重點</h3>
    <div style="font-size:13.5px;line-height:1.95;color:var(--ink2)">${c.intro}</div></div>`;

  out += `<div class="card" style="margin-bottom:18px"><h3><span class="dot"></span>本分類法規（${laws.length} 部）</h3>
    <p class="hint">母法與施行細則為此分類的核心，其餘為授權訂定之子法。點擊進入全文。</p>
    <div class="tablewrap"><table class="t"><thead><tr><th>法規名稱</th><th>屬性</th><th>條數</th><th>最新日期</th></tr></thead><tbody>
    ${core.concat(subs).map(l => {
      const n = l.articles.filter(a => inCat(a, cid)).length;
      return `<tr><td class="k"><button class="ref" style="font-family:var(--sans);font-size:13px;font-weight:700"
          data-law="${l.id}" data-lcat="${cid}">${esc(l.title)}</button></td>
        <td><span class="pill ${l.kind === '母法' ? 'r' : l.kind === '施行細則' ? 'b' : ''}">${esc(l.kind)}</span></td>
        <td>${n}${l.multi ? ` / ${l.articles.length}` : ''}</td><td style="color:var(--ink3);font-size:12px">${esc(l.date || '')}</td></tr>`;
    }).join('')}
    </tbody></table></div></div>`;

  core.forEach(l => {
    const arts = l.articles.filter(a => inCat(a, cid));
    if (!arts.length) return;
    out += `<div class="chdiv"><h3>${esc(l.title)}（${arts.length} 條）</h3><div class="ln"></div></div>`;
    let lastCh = null;
    arts.forEach(a => {
      if (a.ch && a.ch !== lastCh && l.id === 'A0030057') { lastCh = a.ch; }
      out += artHTML(a, null);
    });
  });
  return out;
}

function viewSearch(q) {
  const res = search(q);
  if (!res.length) {
    return `<div class="empty"><div class="big">🔍</div><h3>找不到「${esc(q)}」</h3>
      <p>試試：只留關鍵詞（如 <code>押標金</code>）· 改用同義詞 · 放寬搜尋範圍為「全部法規」<br>
      或直接輸入條號，例如 <code>101</code>。</p></div>`;
  }
  const terms = tokenize(q);
  const groups = [];
  const gm = {};
  res.forEach(r => {
    if (!gm[r.rec.lid]) { gm[r.rec.lid] = { lid: r.rec.lid, lt: r.rec.lt, items: [] }; groups.push(gm[r.rec.lid]); }
    gm[r.rec.lid].items.push(r);
  });
  const scopeName = { all: '全部法規', law: '本法規', cat: '本分類', mark: '我的重點' }[S.scope];
  let ltHTML = '';
  if (S.scope === 'all' && terms.length) {
    const lts = LETTERS.filter(x => terms.every(t => (x.s + ' ' + (x.n || '')).indexOf(t) >= 0));
    if (lts.length) {
      ltHTML = `<div class="resgrp"><h4>工程會解釋函令<span class="n">${lts.length}</span></h4>` +
        `<div class="ltlist">${lts.slice(0, 8).map(x => ltRow(x, terms)).join('')}</div>` +
        (lts.length > 8 ? `<div style="margin-top:8px"><button class="tbtn" data-lt=""
            data-ltq="${esc(q)}">在函釋檢索中查看全部 ${lts.length} 則 →</button></div>` : '') + `</div>`;
    }
  }
  return `<div class="rescount">在<b> ${scopeName} </b>中找到 <b>${res.length}</b> 條符合「${esc(q)}」，分佈於 ${groups.length} 部法規</div>` +
    groups.map(g => `<div class="resgrp"><h4>${esc(g.lt)}<span class="n">${g.items.length}</span></h4>` +
      g.items.slice(0, 40).map(r => `<button class="res" data-go="${r.rec.lid}#${r.rec.no}">
        <span class="rno">${esc(r.rec.label)}</span><span class="rch">${esc(r.rec.ch || '')}</span>
        <div class="rtx">${hl(snippet(r.rec.text, terms), terms)}</div></button>`).join('') +
      (g.items.length > 40 ? `<div style="font-size:11.5px;color:var(--ink3);padding:4px 2px">…另有 ${g.items.length - 40} 條，請再加關鍵字縮小範圍</div>` : '') +
      `</div>`).join('') + ltHTML;
}

function viewMarks() {
  const arr = Array.from(marks).map(k => { const [lid, no] = k.split('#'); return LAWBY[lid] && LAWBY[lid].artBy[no] ? LAWBY[lid].artBy[no] : null; }).filter(Boolean);
  if (!arr.length) return `<div class="crumb">我的重點</div><div class="empty"><div class="big">★</div>
    <h3>還沒有標記任何條文</h3><p>在任一條文右上角點 <code>☆</code> 即可加入；標記會存在此瀏覽器中。</p></div>`;
  const by = {};
  arr.forEach(a => { (by[a.lid] = by[a.lid] || []).push(a); });
  return `<div class="crumb">我的重點</div>
    <div class="lawhead"><h2>我的重點</h2><div class="lawmeta"><span>已標記 <b>${arr.length}</b> 條</span>
      <span><button class="ref" id="clearMarks">清除全部標記</button></span></div></div>` +
    Object.keys(by).map(lid => `<div class="chdiv"><h3>${esc(LAWBY[lid].title)}</h3><div class="ln"></div></div>` +
      by[lid].map(a => artHTML(a, null)).join('')).join('');
}

/* ---------- 母法 / 細則 對照表 ---------- */
function viewCmp() {
  const main = LAWBY['A0030057'];
  if (!main) return '<div class="empty"><h3>缺少母法資料</h3></div>';
  let rows = '';
  main.articles.forEach(a => {
    const rel = REV['A0030057#' + a.no] || [];
    const det = rel.filter(r => r.lid === 'A0030058');
    const sub = rel.filter(r => r.lid !== 'A0030058');
    const lt = LBYART[a.no] || [];
    if (!rel.length && !lt.length) return;
    rows += `<tr>
      <td class="k"><button class="ref" style="font-weight:800;font-size:12.5px" data-go="A0030057#${a.no}">${esc(a.label)}</button>
        <div style="font-size:10.5px;color:var(--ink3);font-weight:400;max-width:190px;line-height:1.5">${esc(a.lines[0].slice(0, 34))}…</div></td>
      <td>${det.length ? det.map(r => `<button class="relchip" data-go="${r.lid}#${r.no}">${esc(r.label)}</button>`).join(' ') : '<span style="color:var(--ink3)">—</span>'}</td>
      <td>${sub.length ? sub.map(r => `<button class="relchip" data-go="${r.lid}#${r.no}">${esc(r.ls)}${esc(r.label)}</button>`).join(' ') : '<span style="color:var(--ink3)">—</span>'}</td>
      <td>${lt.length
        ? `<button class="relchip" data-lt="${a.no}" data-ltgo="1"><span class="ltcount">${lt.length}</span> 則 →</button>
           <div style="font-size:10.5px;color:var(--ink3);line-height:1.6;margin-top:4px">最新 ${esc(ltDate(LETTERS[lt[0]].d))}</div>`
        : '<span style="color:var(--ink3)">—</span>'}</td>
    </tr>`;
  });
  const noRef = main.articles.filter(a => !(REV['A0030057#' + a.no] || []).length && !(LBYART[a.no] || []).length);
  return `<div class="crumb">工具</div>
  <div class="lawhead"><h2>母法／施行細則／子法 對照表</h2>
    <div class="lawmeta"><span>由程式自動解析各法規條文中「本法第○條」之引用關係產生</span></div></div>
  <div class="note" style="margin:0 0 16px">此表呈現的是<b>反向引用</b>：左欄為政府採購法條文，中間兩欄列出「明文引用該條」的施行細則與子法條文，
    右欄為工程會解釋函令則數（點擊可篩選該條號的全部函釋）。
    未明文引用者不會出現在此表，但仍可能相關；請併用左側分類瀏覽與全文搜尋。</div>
  <div class="card"><div class="tablewrap"><table class="t">
    <thead><tr><th style="width:196px">政府採購法</th><th style="width:26%">施行細則</th><th>其他子法</th><th style="width:104px">工程會函釋</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>
  <div class="card" style="margin-top:14px"><h3><span class="dot"></span>未被明文引用之母法條文（${noRef.length} 條）</h3>
    <p class="hint">這些條文既未被子法以「本法第○條」引用，也沒有對應的工程會函釋，多為直接適用之實體規定。</p>
    <div style="display:flex;flex-wrap:wrap;gap:5px">
      ${noRef.map(a => `<button class="relchip" data-go="A0030057#${a.no}">${esc(a.label)}</button>`).join('')}
    </div></div>`;
}

/* ---------- 速記卡 ---------- */
function refBtn(lid, no, text) {
  const l = LAWBY[lid];
  if (!l || !l.artBy[no]) return esc(text || '');
  return `<button class="ref" data-go="${lid}#${no}">${esc(text || (l.short || l.title) + l.artBy[no].label)}</button>`;
}
function viewMemo() {
  const A = (no, t) => refBtn('A0030057', no, t || '採購法§' + no);
  const B = (no, t) => refBtn('A0030058', no, t || '細則§' + no);
  const cards = D.memo.map((card, mi) => `<div class="card${card.wide ? ' wide' : ''}${MEMO.id === mi ? ' flash' : ''}" id="memo-${mi}" style="scroll-margin-top:150px">
    <h3><span class="dot"></span>${card.t}</h3>
    ${card.h ? `<p class="hint">${card.h}</p>` : ''}
    ${card.table ? `<div class="tablewrap"><table class="t">
        <thead><tr>${card.table.head.map(x => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${card.table.rows.map(r => `<tr>${r.map((cell, i) => `<td${i === 0 ? ' class="k"' : ''}>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>` : ''}
    ${card.list ? `<ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.9">${card.list.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
    ${card.mnemo ? `<div class="mnemo"><div class="lb">${card.mnemoLabel || '口訣 / 記憶點'}</div><p>${card.mnemo}</p></div>` : ''}
    ${card.note ? `<div class="note">${card.note}</div>` : ''}
  </div>`).join('');
  return `<div class="crumb">工具</div>
   <div class="lawhead"><h2>重點速記卡</h2>
     <div class="lawmeta"><span>高頻考點整併表 · 每個條號都可點擊回到原文</span></div></div>
   <div class="grid g2">${cards}</div>`;
}

/* ---------- 練習紀錄：錯題本 + Leitner 間隔重複 ---------- */
/* QS[key] = {n:作答次數, w:答錯次數, box:1~5, due:下次到期(ms), last:上次作答(ms)}
   key 為題目在 D.quiz 中的索引；box 越高代表越熟，間隔越長。 */
let QS = LS.get('qstat', {});
const saveQS = () => LS.set('qstat', QS);
let FS = LS.get('fstat', {});                  // 條號翻牌卡也有自己的複習排程
const saveFS = () => LS.set('fstat', FS);

/* 選擇題：以穩定 id 記錄 */
function srsGet(i) { return QS[QID[i]] || null; }
function srsDue(i, now) { return boxDue(QS, QID[i], now); }
function srsRecord(i, ok) { boxRecord(QS, QID[i], ok); saveQS(); }
function srsStats() { return boxStats(QS, QID); }

/* 翻牌卡：key＝模式:條文，看條號背條文與看條文猜條號分開排程 */
function fcKey(r, mode) { return mode + ':' + r.lid + '#' + r.no; }
function fcDue(k, now) { return boxDue(FS, k, now); }
function fcRecord(k, ok) { boxRecord(FS, k, ok); saveFS(); }
function fcStats(mode) { return boxStats(FS, IDX.map(r => fcKey(r, mode))); }

function srsBar() {
  const st = srsStats();
  const pct = st.total ? Math.round(st.mastered / st.total * 100) : 0;
  return `<div class="srs">
    <div class="srsrow">
      <span><b>${st.done}</b> / ${st.total} 已練習</span>
      <span class="ok">熟練 <b>${st.mastered}</b></span>
      <span class="ng">錯題 <b>${st.wrong}</b></span>
      <span>待複習 <b>${st.due}</b></span>
      <button class="ref" data-qa="clearstat">清除紀錄</button>
    </div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="srshint">答對一次往後排（1 → 3 → 7 → 21 天），答錯歸零重來。紀錄存在這個瀏覽器，
      建議到<button class="ref" data-view="home">首頁</button>匯出備份。</div>
  </div>`;
}

/* ---------- 自我測驗（選擇題 + 條號翻牌） ---------- */
let QZ = { mode: 'mcq', scope: 'all', pool: [], i: 0, shown: false, picked: null,
  right: 0, wrong: 0, focusR: null, range: null, fdue: false };

/* 條號的數字部分（'73-1' → 73），供「只考這一段」比對範圍 */
function artNum(no) { const m = String(no).match(/^\d+/); return m ? +m[0] : 0; }
function inRange(rkey, rg) {
  if (!rg) return true;
  const [lid, no] = String(rkey).split('#');
  if (lid !== rg.lid) return false;
  const n = artNum(no);
  return n >= rg.from && n <= rg.to;
}

function quizScopes() {
  return [['all', '全部'], ['main', '只考採購法'], ['md', '採購法＋細則'], ['mark', '★我的重點']]
    .concat(D.cats.map(c => ['c:' + c.id, c.name]));
}
function scopeQuiz(list) {
  if (QZ.scope === 'main' || QZ.scope === 'md') return list.filter(x => x.r.indexOf('A003005') === 0);
  if (QZ.scope === 'mark') return list.filter(x => marks.has(x.r));
  if (QZ.scope.indexOf('c:') === 0) return list.filter(x => x.c === QZ.scope.slice(2));
  return list;
}
function buildPool() {
  QZ.i = 0; QZ.shown = false; QZ.picked = null; QZ.right = 0; QZ.wrong = 0;
  let p;
  const mcqMode = ['mcq', 'wrong', 'due', 'focus', 'range'].indexOf(QZ.mode) >= 0;
  if (mcqMode) {
    p = D.quiz.map((q, i) => Object.assign({ _k: i, _id: QID[i] }, q));
    if (QZ.mode === 'wrong') p = p.filter(x => { const st = srsGet(x._k); return st && st.w > 0 && st.box < 5; });
    else if (QZ.mode === 'due') { const now = Date.now(); p = p.filter(x => srsDue(x._k, now)); }
    else if (QZ.mode === 'focus') p = p.filter(x => x.r === QZ.focusR);
    else if (QZ.mode === 'range') p = p.filter(x => inRange(x.r, QZ.range));
    if (QZ.mode !== 'focus' && QZ.mode !== 'range') p = scopeQuiz(p);
    if (QZ.mode === 'due') {                    // 逾期越久越先出，沒做過的排最後
      p.sort((a, b) => ((srsGet(a._k) || {}).due || Infinity) - ((srsGet(b._k) || {}).due || Infinity));
      QZ.pool = p; return;
    }
  } else {
    p = IDX.filter(r => r.text.length > 25);
    if (QZ.scope === 'main') p = p.filter(r => r.lid === 'A0030057');
    else if (QZ.scope === 'md') p = p.filter(r => r.lid === 'A0030057' || r.lid === 'A0030058');
    else if (QZ.scope === 'mark') p = p.filter(r => marks.has(r.lid + '#' + r.no));
    else if (QZ.scope.indexOf('c:') === 0) p = p.filter(r => r.cats.indexOf(QZ.scope.slice(2)) >= 0);
    if (QZ.fdue) { const now = Date.now(); p = p.filter(r => fcDue(fcKey(r, QZ.mode), now)); }
  }
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  QZ.pool = p;
}

/* 同一條文的其他題目（答錯後的追打） */
function sameArtQuestions(rkey, exceptK) {
  return D.quiz.map((q, i) => ({ q, i })).filter(x => x.q.r === rkey && x.i !== exceptK);
}

function viewQuiz() {
  if (!QZ.pool.length) buildPool();
  const st = srsStats();
  const fc = ['no', 'tx'].indexOf(QZ.mode) >= 0;
  const fst = fc ? fcStats(QZ.mode) : null;
  const rangeLabel = QZ.mode === 'range' && QZ.range
    ? `${esc((LAWBY[QZ.range.lid] || {}).short || '')} §${QZ.range.from}–§${QZ.range.to}` : '';

  const head = `<div class="crumb">工具</div>
   <div class="lawhead"><h2>自我測驗</h2>
     <div class="lawmeta"><span>${D.quiz.length} 題選擇題（自製練習題，非官方考古題）　·　${IDX.length} 條條號翻牌卡</span>
       <span class="pill r">答錯自動收進錯題本並標記該條</span></div></div>
   ${srsBar()}
   <div class="scoperow chiprow-scroll" style="margin:0 0 10px">
     <span class="lbl">題型</span>
     <button class="chip${QZ.mode === 'mcq' ? ' on' : ''}" data-qm="mcq">選擇題</button>
     <button class="chip${QZ.mode === 'due' ? ' on' : ''}" data-qm="due">排程複習 <b style="opacity:.6">${st.due}</b></button>
     <button class="chip${QZ.mode === 'wrong' ? ' on' : ''}" data-qm="wrong">錯題本 <b style="opacity:.6">${st.wrong}</b></button>
     <button class="chip" data-view="exam">◷ 模擬考</button>
     <button class="chip${QZ.mode === 'no' ? ' on' : ''}" data-qm="no">看條文猜條號</button>
     <button class="chip${QZ.mode === 'tx' ? ' on' : ''}" data-qm="tx">看條號背條文</button>
     ${QZ.mode === 'focus' ? `<button class="chip on" data-qm="focus">追打同一條</button>` : ''}
     ${QZ.mode === 'range' ? `<button class="chip on" data-qm="range">讀書計畫 ${rangeLabel}</button>` : ''}
     <button class="chip" data-qa="reset">↺ 重新開始</button>
   </div>
   ${fc ? `<div class="scoperow" style="margin:0 0 10px">
       <span class="lbl">排程</span>
       <button class="chip${QZ.fdue ? ' on' : ''}" data-qa="fdue">只出到期的卡（${fst.due}）</button>
       <span style="font-size:11.5px;color:var(--ink3)">熟練 ${fst.mastered} · 已練 ${fst.done}/${fst.total}</span>
     </div>` : ''}
   <div class="scoperow chiprow-scroll" style="margin:0 0 18px">
     <span class="lbl">範圍</span>
     ${quizScopes().map(([v, n]) => `<button class="chip${QZ.scope === v ? ' on' : ''}" data-qs="${v}">${n}</button>`).join('')}
   </div>`;

  if (!QZ.pool.length) return head + `<div class="empty"><div class="big">✓</div>
    <h3>${QZ.mode === 'wrong' ? '錯題本是空的' : QZ.mode === 'due' ? '目前沒有到期的複習' : '此範圍沒有題目'}</h3>
    <p>${QZ.mode === 'wrong' ? '答錯的題目會自動收進這裡，答對到熟練後移除。'
        : QZ.mode === 'due' ? '所有練習過的題目都還在間隔期內，晚點再回來，或切到「選擇題」繼續練新題。'
        : '換一個範圍，或先在條文上點 <code>☆</code> 標記重點。'}</p></div>`;

  const n = QZ.pool.length, cur = QZ.i % n;
  const done = QZ.right + QZ.wrong;
  const stat = `<div class="bar"><i style="width:${Math.round((cur / n) * 100)}%"></i></div>
    <div class="score"><span>第 <b>${cur + 1}</b> / ${n} 題</span>
      <span class="ok">✓ <b>${QZ.right}</b></span><span class="ng">✗ <b>${QZ.wrong}</b></span>
      ${done ? `<span>正確率 <b>${Math.round(QZ.right / done * 100)}%</b></span>` : ''}</div>`;

  if (!fc) {
    const q = QZ.pool[cur];
    const cat = D.cats.find(c => c.id === q.c);
    const L = ['A', 'B', 'C', 'D'];
    const opts = q.o.map((o, i) => {
      let cls = '';
      if (QZ.picked != null) { if (i === q.a) cls = ' right'; else if (i === QZ.picked) cls = ' wrong'; }
      return `<button class="opt${cls}" data-pick="${i}" ${QZ.picked != null ? 'disabled' : ''}>
        <span class="lt">${L[i]}</span><span>${esc(o)}</span></button>`;
    }).join('');
    const lid = q.r.split('#')[0], ano = q.r.split('#')[1];
    const lawOf = LAWBY[lid];
    const artLabel = lawOf && lawOf.artBy[ano] ? lawOf.artBy[ano].label : '';
    const wrongPick = QZ.picked != null && QZ.picked !== q.a;
    const others = QZ.picked != null ? sameArtQuestions(q.r, q._k) : [];
    const box = (srsGet(q._k) || {}).box || 1;
    return head + `<div class="fcwrap" style="max-width:720px"><div class="mcq">
      <div class="qn">${cat ? esc(cat.code + ' ' + cat.name) : ''}　·　第 ${cur + 1} 題
        ${QZ.picked != null ? `<span style="float:right;font-family:var(--mono);font-size:11px">複習盒 ${box}/5</span>` : ''}</div>
      <div class="qt">${esc(q.q)}</div>
      <div class="opts">${opts}</div>
      ${QZ.picked != null ? `<div class="expl"><div class="lb">${QZ.picked === q.a ? '答對了' : '正解為 ' + L[q.a]}</div>
        <div>${q.e.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>
        ${wrongPick ? `<div style="margin-top:8px;font-size:12px;color:var(--gold)">
            ★ 已自動把${esc((lawOf && (lawOf.short || lawOf.title)) || '')} ${esc(artLabel)} 加入「我的重點」，並收進錯題本。</div>` : ''}
        <div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap">
          ${lawOf ? `<a class="relchip" href="#/law/${lid}/${ano}" data-go="${q.r}">前往 ${esc(lawOf.short || lawOf.title)} ${esc(artLabel)} →</a>` : ''}
          ${others.length ? `<button class="relchip" data-qa="focus" data-r="${q.r}">再練這一條的其他 ${others.length} 題 ↻</button>` : ''}
        </div></div>` : ''}
      </div>
      <div class="fcbar">${QZ.picked != null
        ? `<button class="tbtn on" data-qa="next">下一題 →</button>`
        : `<button class="tbtn" data-qa="skip">跳過 ↷</button>`}</div>
      ${stat}</div>`;
  }

  const r = QZ.pool[cur];
  const k = fcKey(r, QZ.mode);
  const fbox = (FS[k] || {}).box || 1;
  let bodyHTML;
  if (QZ.mode === 'no') {
    bodyHTML = `<div class="q">這是哪一條？</div>
      <div class="body">${esc(r.text.slice(0, 320)).replace(/\n/g, '<br>')}${r.text.length > 320 ? '…' : ''}</div>
      ${QZ.shown ? `<div class="ans"><div class="big">${esc(r.label)}</div>
        <div class="lw">${esc(r.lt)}${r.ch ? ' · ' + esc(r.ch) : ''}</div></div>` : ''}`;
  } else {
    bodyHTML = `<div class="q">${esc(r.lt)}</div>
      <div class="body" style="font-size:24px;font-weight:900;color:var(--accent)">${esc(r.label)}</div>
      <div style="font-size:12.5px;color:var(--ink3);margin-top:6px">${esc(r.ch || '')}</div>
      ${QZ.shown ? `<div class="ans"><div style="font-family:var(--serif);font-size:15px;line-height:1.9">${esc(r.text.slice(0, 400)).replace(/\n/g, '<br>')}${r.text.length > 400 ? '…' : ''}</div></div>` : ''}`;
  }
  return head + `<div class="fcwrap"><div class="fc">
      <div style="text-align:right;font:700 11px var(--mono);color:var(--ink3)">複習盒 ${fbox}/5</div>
      ${bodyHTML}</div>
    <div class="fcbar">
      ${QZ.shown ? `<button class="tbtn" data-qa="right">✓ 答對了</button>
                    <button class="tbtn" data-qa="wrong">✗ 沒記住</button>
                    <button class="tbtn" data-qa="goto">前往原文 →</button>`
                 : `<button class="tbtn on" data-qa="show">翻牌看答案</button>
                    <button class="tbtn" data-qa="skip">跳過 ↷</button>`}
    </div>${stat}</div>`;
}

/* ---------- 工程會解釋函令 ---------- */
const LT = { art: null, q: '', limit: 60 };
/* 3,661 則函釋約佔 data.js 的三分之一，改放 letters.js 並延後載入，首屏才不會被拖住。
   舊版 data.js 仍把 items 內嵌時也能正常運作。 */
let LETTERS = (window.LAW_LETTERS || (D.letters && D.letters.items) || []);
const LBYART = (D.letters && D.letters.byArt) || {};
const LT_COUNT = (D.letters && D.letters.count) || LETTERS.length;
let ltState = LETTERS.length ? 'ready' : 'idle';     // idle | loading | ready | failed
function ensureLetters(cb) {
  if (ltState === 'ready') { cb && cb(true); return; }
  if (ltState === 'loading') return;
  ltState = 'loading';
  const sc = document.createElement('script');
  sc.src = 'letters.js?v=' + (D.letters && D.letters.fetched || '1');
  sc.onload = () => {
    LETTERS = window.LAW_LETTERS || [];
    ltState = LETTERS.length ? 'ready' : 'failed';
    cb && cb(ltState === 'ready');
    if (S.view === 'lt' || S.view === 'law' || S.view === 'cat' || S.view === 'search') render();
  };
  sc.onerror = () => { ltState = 'failed'; cb && cb(false); if (S.view === 'lt') render(); };
  document.head.appendChild(sc);
}

function ltUrl(x) { return D.letters.base + x.i; }
function ltDate(d) { return d ? d.replace(/-/g, '.') : ''; }

function ltFilter() {
  let list = LT.art ? (LBYART[LT.art] || []).map(k => LETTERS[k]) : LETTERS;
  const terms = tokenize(LT.q);
  if (terms.length) {
    list = list.filter(x => {
      const hay = x.s + ' ' + (x.n || '') + ' ' + (x.d || '');
      return terms.every(t => hay.indexOf(t) >= 0);
    });
  }
  return list;
}
function ltRow(x, terms) {
  const arts = (x.a || []).slice(0, 6).map(a =>
    `<button class="relchip" data-go="A0030057#${a}">§${a}</button>`).join('');
  return `<div class="lt">
    <div class="ltmeta"><span class="ltd">${esc(ltDate(x.d))}</span>
      <span class="ltn">${esc(x.n || '')}</span></div>
    <div class="lts">${terms && terms.length ? hl(x.s, terms) : esc(x.s)}</div>
    <div class="ltfoot">${arts}
      <a class="relchip" href="${ltUrl(x)}" target="_blank" rel="noopener">看全文 ↗</a></div>
  </div>`;
}
function viewLetters() {
  if (ltState !== 'ready') {
    ensureLetters();
    return `<div class="crumb">工具</div>
      <div class="lawhead"><h2>工程會解釋函令</h2>
        <div class="lawmeta"><span>共 <b>${LT_COUNT}</b> 則</span></div></div>
      <div class="ltloading">${ltState === 'failed'
        ? '函釋索引載入失敗，請重新整理頁面再試一次。'
        : '正在載入 ' + LT_COUNT + ' 則函釋索引…'}</div>`;
  }
  const list = ltFilter();
  const terms = tokenize(LT.q);
  const shown = list.slice(0, LT.limit);
  const topArts = Object.keys(LBYART)
    .sort((a, b) => LBYART[b].length - LBYART[a].length).slice(0, 24);
  const main = LAWBY['A0030057'];
  return `<div class="crumb">工具</div>
  <div class="lawhead"><h2>工程會解釋函令</h2>
    <div class="lawmeta">
      <span>共 <b>${LT_COUNT}</b> 則　·　對應 <b>${Object.keys(LBYART).length}</b> 個採購法條號</span>
      <span>擷取日期：${esc(D.letters.fetched)}</span>
      <span class="pill b">索引・全文連回政府電子採購網</span>
    </div></div>
  <div class="note" style="margin:0 0 16px">此處收錄的是<b>函釋索引</b>（主旨摘要、發文日期與字號、所對應之採購法條號），
    可在站內直接搜尋；點「看全文 ↗」回政府電子採購網解釋函令系統閱讀完整主旨與說明。
    摘要在來源即為節錄，過長者於 100 字截斷。</div>
  <div class="card wide" style="margin-bottom:16px">
    <div class="searchbox" style="margin-bottom:12px">
      <span class="ic">🔍</span>
      <input id="ltq" type="search" autocomplete="off" spellcheck="false" value="${esc(LT.q)}"
        placeholder="在 ${LT_COUNT} 則函釋中搜尋主旨或發文字號…" style="padding-right:14px">
    </div>
    <div class="scoperow" style="margin:0">
      <span class="lbl">條號</span>
      <button class="chip${LT.art ? '' : ' on'}" data-lt="">全部</button>
      ${topArts.map(a => `<button class="chip${LT.art === a ? ' on' : ''}" data-lt="${a}">§${a}
        <b style="opacity:.6">${LBYART[a].length}</b></button>`).join('')}
    </div>
  </div>
  <div class="rescount">
    ${LT.art ? `採購法<b>第 ${esc(LT.art)} 條</b>　` : ''}
    符合 <b>${list.length}</b> 則${list.length > shown.length ? `（顯示前 ${shown.length} 則）` : ''}
    ${LT.art && main && main.artBy[LT.art]
      ? `　<button class="ref" data-go="A0030057#${LT.art}">前往條文原文 →</button>` : ''}
  </div>
  ${shown.length ? `<div class="ltlist">${shown.map(x => ltRow(x, terms)).join('')}</div>` :
    `<div class="empty"><div class="big">🔍</div><h3>沒有符合的函釋</h3>
      <p>換個關鍵字，或把條號改回「全部」。</p></div>`}
  ${list.length > shown.length
    ? `<div style="text-align:center;margin-top:16px">
        <button class="tbtn" data-ltmore="1">再顯示 60 則（尚有 ${list.length - shown.length} 則）</button></div>` : ''}`;
}

/* 條文卡片下方的函釋摘要（僅母法） */
function lettersForArticle(a) {
  if (a.lid !== 'A0030057') return '';
  const ks = LBYART[a.no];
  if (!ks || !ks.length) return '';
  if (ltState !== 'ready') {
    ensureLetters();
    return `<div class="relbar"><span class="rl">工程會函釋 ${ks.length} 則</span>
      <button class="relchip" data-lt="${a.no}" data-ltgo="1">全部 ${ks.length} 則 →</button></div>`;
  }
  const top = ks.slice(0, 3).map(k => LETTERS[k]).filter(Boolean);
  return `<div class="relbar"><span class="rl">工程會函釋 ${ks.length} 則</span>
    ${top.map(x => `<a class="relchip" href="${ltUrl(x)}" target="_blank" rel="noopener"
       title="${esc(x.s)}">${esc(ltDate(x.d))}　${esc(x.s.slice(0, 22))}…</a>`).join('')}
    <button class="relchip" data-lt="${a.no}" data-ltgo="1">全部 ${ks.length} 則 →</button></div>`;
}

/* ---------- 圖解流程 ---------- */

function acceptanceEditorial(){
 const icons={check:'<path d="m7 12 3 3 7-7"/><rect x="3" y="3" width="18" height="18" rx="4"/>',file:'<path d="M14 3H5v18h14V8zM14 3v6h5M8 13h8M8 17h6"/>',inspect:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',award:'<circle cx="12" cy="9" r="6"/><path d="m8 15-1 7 5-3 5 3-1-7m-7-13 2 2 4-4"/>'};
 const steps=[['01','機關 × 監造 × 廠商','7','核對竣工','收到書面通知之日起','92','check'],['02','監造單位','7','送竣工資料','工程竣工後，送機關審核','92','file'],['03','機關','30','辦理初驗','收受全部資料之日起','92','inspect'],['04','機關','20','辦理驗收','初驗合格後','93','award']];
 return `<section class="accept-book" aria-label="驗收與付款圖解"><header class="accept-cover"><div class="accept-intro"><div class="accept-eyebrow">PROCUREMENT FIELD NOTES · 05</div><h2>從竣工，到驗收。</h2><p>先辨有無初驗，再記期限與起算點。<br>讓每一個數字，都有清楚的位置。</p><div class="accept-badges"><span>履約管理</span><span>驗收時程</span><span>圖像記憶</span></div></div><img src="assets/acceptance-editorial.webp" alt="公共建築與人員持清單查驗的紙雕風格插畫"></header>
 <div class="accept-content"><div class="accept-toolrow"><p>閱讀順序　<span aria-hidden="true">A → B → C</span>　先比較程序，再看付款</p><button class="recall-toggle" type="button" aria-pressed="false">遮住數字，練習回想</button></div>
 <div class="route-heading"><span class="route-letter">A</span><div><h3>有初驗程序</h3><p>四個關鍵動作，各有起算點</p></div><span class="route-line"></span><span class="route-tag">INSPECTION ROUTE</span></div>
 <p class="accept-start">起點｜廠商於工程預定竣工日前或竣工當日，書面通知監造單位及機關。</p>
 <ol class="accept-steps">${steps.map(x=>`<li class="accept-step"><div class="step-top"><span>STEP ${x[0]}</span><span class="step-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icons[x[6]]}</svg></span></div><div class="accept-days"><strong class="quiz-number">${x[2]}</strong><span>日內</span></div><h4>${x[3]}</h4><p>${x[1]}<br>${x[4]}</p><button class="accept-ref" data-go="A0030058#${x[5]}">施行細則 §${x[5]} ↗</button></li>`).join('')}</ol>
 <p class="accept-note">這是步驟導覽，不是天數相加：第二個 7 日從「竣工後」起算，30 日初驗則從「收受全部資料」起算。細則第 92、93 條另有契約約定規定，請點法源核對。</p>
 <div class="route-heading"><span class="route-letter" style="background:#f5ecd9;color:#947443">B</span><div><h3>無初驗程序</h3><p>不經初驗，直接進入驗收</p></div><span class="route-line"></span></div>
 <div class="direct-route"><div class="direct-copy"><h4>接獲通知備驗，或可得驗收程序完成後</h4><p>除契約另有規定外　·　<button class="accept-ref" data-go="A0030058#94">施行細則 §94 ↗</button></p></div><div class="accept-days"><strong class="quiz-number">30</strong><span>日內</span></div><span class="direct-arrow" aria-hidden="true">→</span><span class="direct-finish">辦理驗收</span></div>
 <section class="pay-section"><div class="route-heading"><span class="route-letter" style="background:#f8eae2;color:#a56851">C</span><div><h3>付款，另外記。</h3><p>先區分估驗／分階段付款與驗收付款</p></div><span class="route-line"></span><button class="accept-ref" data-go="A0030057#73-1">採購法 §73-1 ↗</button></div>
 <div class="pay-grid"><div class="pay-card"><h4>估驗／分階段付款</h4><div class="pay-flow"><div><strong class="quiz-number">15</strong><span> 工作日審核</span></div><span>→</span><div><strong class="quiz-number">15</strong><span> 工作日付款</span></div></div><p>提出估驗或階段完成證明後審核；接到請款單據後付款。兩段各有起算點。</p></div><div class="pay-card"><h4>驗收付款</h4><div class="pay-flow"><strong class="quiz-number">15</strong><span> 工作日付款</span></div><p>驗收合格後填具結算驗收證明文件；接到廠商請款單據後起算。</p></div></div>
 <div class="pay-note"><b>補助款例外</b><span>向上級機關申請核撥補助款者，付款期限為 <strong class="quiz-number">30</strong> 工作日。除契約另有約定外；工作日不含例假日、特定假日及退請補正日數。</span></div></section>
 <div class="memory-ribbon"><span>記憶口訣 / RECALL</span><p>核對七、送件七；初驗三十、合格後二十。<br>無初驗三十；付款分軌，記得看單據。</p></div>
 </div></section>`;
}
document.addEventListener('click',e=>{const b=e.target.closest('.recall-toggle');if(!b)return;const on=b.closest('.accept-book').classList.toggle('is-recalling');b.setAttribute('aria-pressed',String(on));b.textContent=on?'顯示數字，核對答案':'遮住數字，練習回想';});

let DG = { id: "accept" };
function dgFigure(d) {
  return `<figure class="dg">
    <div class="hint-scroll">← 左右滑動可看完整流程圖 →</div>
    <div class="svgwrap">${d.svg}</div>
    <figcaption>${esc(d.cap)}</figcaption></figure>`;
}
function dgCard(d, withTitle) {
  if(d.id === "accept") return acceptanceEditorial();
  const cat = D.cats.find(c => c.id === d.cat);
  return `<div class="dgcard">
    ${withTitle ? `<h3><span class="dot"></span>${esc(d.t)}
      ${cat ? `<span class="pill" style="font-weight:700">${esc(cat.name)}</span>` : ''}</h3>` : ''}
    ${dgFigure(d)}</div>`;
}
function viewDiagrams() {
  const list = D.diagrams;
  if (!DG.id || !list.some(x => x.id === DG.id)) DG.id = list[0].id;
  const d = list.find(x => x.id === DG.id);
  return `<div class="crumb">工具</div>
  <div class="lawhead"><h2>圖解流程</h2>
    <div class="lawmeta"><span>${list.length} 張流程圖　·　每張對應一個分類的核心機制</span>
      <span class="pill">學習整理</span></div></div>
  <div class="dgnav">${list.map(x => {
      const c = D.cats.find(y => y.id === x.cat);
      return `<button class="chip${x.id === DG.id ? ' on' : ''}" data-dg="${x.id}">${c ? esc(c.code) + ' ' : ''}${esc(x.t.split('：')[0])}</button>`;
    }).join('')}</div>
  ${dgCard(d, true)}`;
}

/* ---------- 易混淆概念比較 ---------- */
let CMP = { id: null };
function viewCompare() {
  const list = D.compare;
  if (!CMP.id || !list.some(x => x.id === CMP.id)) CMP.id = list[0].id;
  const c = list.find(x => x.id === CMP.id);
  const cat = D.cats.find(x => x.id === c.cat);
  return `<div class="crumb">工具</div>
  <div class="lawhead"><h2>易混淆概念比較</h2>
    <div class="lawmeta"><span>${list.length} 組並排比較表　·　每個條號都可點回原文</span>
      <span class="pill">學習整理</span></div></div>
  <div class="cmpnav">${list.map(x => `<button class="chip${x.id === CMP.id ? ' on' : ''}" data-cmp="${x.id}">${esc(x.t)}</button>`).join('')}</div>
  <div class="card wide">
    <h3><span class="dot"></span>${esc(c.t)}${cat ? ` <span class="pill" style="font-weight:700">${esc(cat.name)}</span>` : ''}</h3>
    ${c.h ? `<p class="hint">${c.h}</p>` : ''}
    <div class="tablewrap"><table class="cmptbl">
      <thead><tr>${c.head.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${c.rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    ${c.mnemo ? `<div class="mnemo"><div class="lb">記憶點</div><p>${c.mnemo}</p></div>` : ''}
    ${c.note ? `<div class="note">${c.note}</div>` : ''}
  </div>`;
}


/* 採購旅程：圖像線索 → 主動回想 → 法源 */
const JOURNEY = [
 ['▤','需求書桌','先辨識採購','把工程、財物、勞務放進三個抽屜，再確認機關與適用範圍。','學校要購買電腦：先辨識採購標的，再判斷適用規定。','採購的三種標的是什麼？','工程、財物、勞務。分類後仍須判斷個案適用範圍。','2','g'],
 ['⌂','招標大門','選擇進場方式','公開招標像開放大門；選擇性招標像先審入場資格；限制性招標像依法邀請。','比喻只幫助記憶。公告金額以上以公開招標為原則，例外須查法定要件。','限制性招標是否能只因方便而使用？','不能。應查核第22條等適用依據與個案要件；三種方式的定義見第18條。','18','b'],
 ['⚖','決標天平','分清選人與選標','大門回答「誰來投標」；天平回答「用什麼原則決標」。','把招標方式與決標原則分成兩個問題，避免把公開招標直接等同最低標。','公開招標一定只能用最低標嗎？','不是。招標方式與決標原則須分別判斷；決標原則與適用條件見第52條。','52','d'],
 ['⚒','履約工地','把承諾做出來','得標後進入履約場景：依契約執行，並區分轉包與分包。','想像得標廠商仍站在工地中央，提醒自己履約責任不因分包而消失。','得標後可以把契約轉包嗎？','第65條規定不得轉包；第67條另規定分包及得標廠商責任。應回原文比較。','65','p'],
 ['✓','驗收關卡','逐項核對成果','拿著契約清單對照成果：履約完成後，仍要進行驗收程序。','把「做完」與「驗收合格」放成兩張不同的卡片。','成果不符契約時，可以直接當成合格嗎？','不能直接等同合格。第72條規定改善等處理及減價收受的要件，應逐項判斷。','72','p'],
 ['⑂','爭議路口','先分辨爭議階段','招標、審標、決標爭議與履約爭議，在路口分開思考。','前段查異議、申訴；履約爭議查調解等途徑。停權另有第102條程序。','所有爭議都直接走同一條申訴程序嗎？','不是。先辨識爭議性質，再查第75、76、85條之1或第102條等規定的要件及期限。','75','r']
];
function journeyView(){
 const done=LS.get('journey',{});
 return `<section class="journey"><div class="journey-hero"><small>圖像記憶 · 六站學習路線</small><h2>跟著一件採購，走過六個場景。</h2><p>先看場景 → 遮住答案回想 → 展開解說 → 回讀法條。每站約 3 分鐘。</p><p>已練習 ${JOURNEY.filter((_,i)=>done[i]).length} / 6 站</p></div>
 <nav class="journey-route" aria-label="六站導覽">${JOURNEY.map((x,i)=>`<a href="#station-${i}"><span>${x[0]}</span>${i+1} ${x[1]}</a>`).join('')}</nav>
 <div class="journey-grid">${JOURNEY.map((x,i)=>`<article class="journey-station" id="station-${i}"><div class="scene" aria-hidden="true"><span>${x[0]}</span><b>0${i+1}</b></div><div class="station-body"><small>${x[1]}</small><h3>${x[2]}</h3><p>${x[3]}</p><p class="scene-example">${x[4]}</p><details><summary>先回想：${x[5]}</summary><p>${x[6]}</p></details><div class="station-actions"><button class="chip" data-go="A0030057#${x[7]}">讀第 ${x[7]} 條</button><button class="chip" data-cat="${x[8]}">圖解與相關法規</button></div><label><input type="checkbox" data-journey="${i}" ${done[i]?'checked':''}> 我已回想並核對法條</label></div></article>`).join('')}</div>
 <div class="card"><h3>把六個場景串成一句話</h3><p>書桌辨需求，大門選招標，天平作決標，工地管履約，關卡做驗收，路口分爭議。</p><p>場景是學習比喻，並非完整法定程序；特殊採購、例外、金額與期限請回到各條文確認。</p><button class="chip" data-view="cmp2">比較易混淆概念</button> <button class="chip" data-view="quiz">進入自我測驗</button></div>
 <div class="card"><h3>法源與收錄範圍</h3><p>沿用原站 ${LAWS.length} 部法規資料，原擷取日期：${esc(D.meta.generated)}。本次新增學習場景，並不代表所有法規已重新查核。</p><p><a href="https://www.pcc.gov.tw/content/cp.aspx?lang=1&n=2BE68E5656E06EFA" target="_blank" rel="noopener">工程會政府採購法規入口 ↗</a> · <a href="https://www.pcc.gov.tw/content/index?eid=2804&type=C" target="_blank" rel="noopener">工程會訂頒相關作業規定 ↗</a></p><p>已收錄：採購契約要項（108.08.06）、政府採購錯誤行為態樣（113.12.05）及工程會令函釋示。尚未收錄：各類採購契約範本、投標須知範本（僅提供檔案下載）。行政規則清單仍需定期比對新增、修正與停止適用項目。</p></div></section>`;
}
/* 讀書計畫：勾選當天完成 */
document.addEventListener('change', e => {
  const c = e.target.closest('[data-planchk]');
  if (!c) return;
  const dn = planDone();
  dn[planKey(PL.id, +c.dataset.planchk)] = c.checked;
  LS.set('plan.done', dn);
  render();
});
/* 試算器：輸入即時重算（只換右邊結果，不重繪整頁，輸入游標才不會跳掉） */
document.addEventListener('input', e => {
  const el = e.target.closest('[data-calc]');
  if (!el) return;
  const k = el.dataset.calc;
  CALC[k] = (el.type === 'number') ? (el.value === '' ? '' : +el.value) : el.value;
  const box = $('#calcres');
  if (box) box.innerHTML = CALC.tab === 'money' ? calcMoney() : calcDate();
  if (k === 'amt') { const h = $('.calcform .hintamt'); if (h) h.innerHTML = nt(CALC.amt || 0) + '　＝　' + wan(Number(CALC.amt) || 0); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-calc]');
  if (!el) return;
  const k = el.dataset.calc;
  CALC[k] = (el.type === 'number') ? (el.value === '' ? '' : +el.value) : el.value;
  if (k === 'dtype' || k === 'mode') render();
  else { const box = $('#calcres'); if (box) box.innerHTML = CALC.tab === 'money' ? calcMoney() : calcDate(); }
});
/* 學習紀錄匯入 */
document.addEventListener('change', e => {
  if (e.target.id !== 'fileImport' || !e.target.files || !e.target.files[0]) return;
  importProgress(e.target.files[0], (err, n) => {
    if (err) { alert('匯入失敗：' + err.message); return; }
    alert('已匯入 ' + n + ' 項紀錄，將重新載入頁面。');
    location.reload();
  });
  e.target.value = '';
});

document.addEventListener('change',e=>{
 if(!e.target.matches('[data-journey]')) return;
 const d=LS.get('journey',{}); d[e.target.dataset.journey]=e.target.checked; LS.set('journey',d);
 const counter=document.querySelector('.journey-hero p:last-child');
 if(counter) counter.textContent=`已練習 ${JOURNEY.filter((_,i)=>d[i]).length} / 6 站`;
});


/* ================== 讀書計畫 ================== */
let MEMO = { id: null };
let PL = { id: LS.get('plan.cur', 'd30') };

/* 每天：讀哪一段 → 看哪張圖表 → 練哪些題。
   r: [法規id] 或 [法規id, 起條, 迄條]；m: 速記卡編號；g: 圖解 id；c: 比較表 id；
   q: 當天練習（range = 只考當天讀的那一段） */
const PLAN_DEFS = {
  d30: {
    name: '30 天 · 完整讀一輪',
    sub: '每天約 40 分鐘：讀一段條文 → 看一張速記卡或流程圖 → 做 10～12 題。適合第一次完整讀過採購法。',
    days: [
      { t: '採購的定義與適用對象', r: ['A0030057', 1, 8], m: [], g: [], c: ['apply'], q: { k: 'range' }, n: 10,
        tip: '先分清「機關」「採購」「廠商」三個定義，法人團體受補助的兩個要件要一起記。' },
      { t: '金額級距與監辦', r: ['A0030057', 9, 17], m: [0, 8], g: ['money'], c: ['super'], q: { k: 'range' }, n: 12,
        tip: '公告金額 150 萬、查核金額工程財物 5,000 萬／勞務 1,000 萬——這是全法最常考的一組數字。' },
      { t: '施行細則：總則部分', r: ['A0030058', 1, 20], m: [], g: [], c: [], q: { k: 'cat', v: 'g' }, n: 12,
        tip: '細則是母法的操作說明書，讀的時候一路點「本法第○條」對照回去。' },
      { t: '總則複習 ＋ 錯誤行為態樣（招標前）', r: ['ERRPAT'], m: [0], g: ['money'], c: [], q: { k: 'cat', v: 'g' }, n: 12,
        tip: '錯誤行為態樣是實務上最貼近考題情境的素材，用「這樣做錯在哪」回頭檢查自己的理解。' },
      { t: '三種招標方式 ＋ §22 十六款', r: ['A0030057', 18, 22], m: [1, 2], g: ['bidmode'], c: ['bid'], q: { k: 'range' }, n: 12,
        tip: '§22 十六款不要硬背順序，照「獨家／緊急／追加／後續擴充」分群記。' },
      { t: '招標文件、公告與等標期', r: ['A0030057', 23, 28], m: [3], g: ['period'], c: [], q: { k: 'range' }, n: 12,
        tip: '等標期先記公開招標的 7／14／21／28，再記選擇性招標資格審查的 7／10／14。' },
      { t: '公告、開標與投標文件', r: ['A0030057', 29, 33], m: [], g: [], c: [], q: { k: 'range' }, n: 10,
        tip: '注意「截止投標」與「開標」是兩個時點，各有各的規定。' },
      { t: '保密、資格與規格限制', r: ['A0030057', 34, 38], m: [], g: [], c: [], q: { k: 'range' }, n: 10,
        tip: '§26 規格不得限制競爭是高頻考點，同等品的處理方式要會判斷。' },
      { t: '專案管理、釋疑與分段開標', r: ['A0030057', 39, 44], m: [], g: [], c: [], q: { k: 'range' }, n: 10,
        tip: '§41 釋疑、§42 分段開標，都會牽動等標期與異議期限的起算。' },
      { t: '押標金與各種保證金', r: ['A0030079'], m: [6], g: [], c: ['bond'], q: { k: 'cat', v: 'b' }, n: 12,
        tip: '押標金上限 5%、履約保證金 10%，先把「比例」與「何時發還／不發還」兩條線分開。' },
      { t: '招標期限標準 ＋ 未達公告金額招標辦法', r: ['A0030093'], m: [3, 4], g: ['period'], c: [], q: { k: 'cat', v: 'b' }, n: 12,
        tip: '讀完直接去「試算」分頁，輸入金額對答案，比背表格有效。' },
      { t: '開標、審標與無效標', r: ['A0030057', 45, 50], m: [], g: [], c: ['fail'], q: { k: 'range' }, n: 12,
        tip: '§50 不予開標決標的情形，要與 §48 廢標、§101 停權分清楚。' },
      { t: '底價、決標原則與比減價格', r: ['A0030057', 51, 54], m: [5], g: ['award'], c: [], q: { k: 'range' }, n: 12,
        tip: '減價一次、比減三次、超底價 8% 與 4%——畫成一條時間軸記。' },
      { t: '最有利標與標價偏低', r: ['A0030057', 55, 58], m: [5], g: [], c: ['award'], q: { k: 'range' }, n: 12,
        tip: '§58 總標價低於底價 80%，另有 114.01.14 的執行程序可對照。' },
      { t: '契約、決標公告與資訊公開', r: ['A0030057', 59, 62], m: [], g: [], c: [], q: { k: 'range' }, n: 10,
        tip: '決標後的公告義務常被忽略，但正是「機關傳輸採購資訊錯誤態樣」的重點。' },
      { t: '最有利標評選辦法 ＋ 評選委員會', r: ['A0030080'], m: [], g: ['orgs'], c: ['org'], q: { k: 'cat', v: 'd' }, n: 12,
        tip: '委員會的組成人數與外聘比例是考題最愛的數字。' },
      { t: '契約要項、轉包與分包', r: ['A0030057', 63, 67], m: [13], g: [], c: ['sub'], q: { k: 'range' }, n: 12,
        tip: '轉包是「全部轉給別人做」，分包是「部分交付」——責任歸屬完全不同。' },
      { t: '權利質權、施工管理與查核', r: ['A0030057', 68, 70], m: [13], g: [], c: [], q: { k: 'range' }, n: 10,
        tip: '工程施工查核小組屬於履約管理，和爭議處理的小組不是同一個。' },
      { t: '驗收程序與付款期限', r: ['A0030057', 71, 73], m: [7], g: ['accept'], c: ['accept'], q: { k: 'range' }, n: 12,
        tip: '七、七、三十、二十——先問「有沒有初驗」，再決定走哪一條線。' },
      { t: '施行細則：驗收章', r: ['A0030058', 89, 101], m: [7], g: ['accept'], c: ['accept'], q: { k: 'cat', v: 'p' }, n: 12,
        tip: '細則 §92～§94 就是驗收期限的正本，母法只寫「限期辦理」。' },
      { t: '採購契約要項', r: ['GL000077'], m: [13], g: [], c: [], q: { k: 'cat', v: 'p' }, n: 12,
        tip: '75 點契約要項是所有契約範本的骨架，挑「變更、終止、遲延、保固」四塊先讀。' },
      { t: '錯誤行為態樣（履約與驗收）', r: ['ERRPAT'], m: [7, 13], g: [], c: [], q: { k: 'cat', v: 'p' }, n: 12,
        tip: '每一項態樣都連回所引用的條文，看到不熟的就點進去補。' },
      { t: '異議與申訴', r: ['A0030057', 74, 78], m: [10], g: ['dispute'], c: ['dispute'], q: { k: 'range' }, n: 12,
        tip: '異議對機關、申訴對申訴會；期限 10／15／15，起算點都是「次日」。' },
      { t: '審議判斷與履約爭議', r: ['A0030057', 79, 86], m: [9], g: ['dispute'], c: ['dispute'], q: { k: 'range' }, n: 12,
        tip: '招標決標爭議走異議申訴，履約爭議走調解仲裁——兩條軌道不要混。' },
      { t: '申訴審議規則 ＋ 履約爭議調解規則', r: ['A0030097'], m: [9, 10], g: ['dispute'], c: [], q: { k: 'cat', v: 'r' }, n: 12,
        tip: '工程及技術服務調解，機關不同意調解建議時廠商提付仲裁，機關不得拒絕。' },
      { t: '罰則（§87～§92）', r: ['A0030057', 87, 92], m: [12], g: [], c: [], q: { k: 'range' }, n: 12,
        tip: '罰則的主體是誰（廠商、機關人員、法人）要分清，刑度不必背到年數細節。' },
      { t: '共同供應契約、電子採購與附則', r: ['A0030057', 93, 100], m: [], g: [], c: ['pack'], q: { k: 'range' }, n: 10,
        tip: '§93 共同供應契約與 §93-1 電子採購，是實務上最常用到的兩條附則。' },
      { t: '停權：§101 → §102 → §103', r: ['A0030057', 101, 103], m: [11], g: ['debar'], c: ['penalty'], q: { k: 'range' }, n: 12,
        tip: '事由（101）→ 異議申訴（102）→ 期間（103），一條線走完再回頭記款次。' },
      { t: '附則其餘條文 ＋ 採購人員倫理準則', r: ['A0030095'], m: [14], g: [], c: [], q: { k: 'cat', v: 'z' }, n: 12,
        tip: '倫理準則的「不得為之行為」與利益迴避，屬於綜合分類的必考題。' },
      { t: 'GPA 與總複習', r: ['A0030057', 104, 114], m: [15], g: ['gpa'], c: [], q: { k: 'exam', n: 50, sec: 3600 }, n: 50,
        tip: '最後一天用一次 50 題模擬考檢查成果，考完看分類弱點圖決定要回頭補哪一塊。' }
    ]
  },
  d7: {
    name: '7 天 · 考前衝刺',
    sub: '每天約 60 分鐘：只看最高頻的圖與表，然後大量做題。適合已經讀過一輪、要把數字記牢的人。',
    days: [
      { t: '金額級距與監辦', r: ['A0030057', 9, 17], m: [0, 8], g: ['money'], c: ['super'], q: { k: 'cat', v: 'g' }, n: 20,
        tip: '所有金額題的起點。做完去「試算」輸入幾個金額驗收成果。' },
      { t: '招標方式與等標期', r: ['A0030057', 18, 28], m: [1, 2, 3, 4], g: ['bidmode', 'period'], c: ['bid'], q: { k: 'cat', v: 'b' }, n: 20,
        tip: '§22 十六款用分群記；等標期用試算器反覆驗算。' },
      { t: '決標與比減價格', r: ['A0030057', 45, 58], m: [5], g: ['award'], c: ['award', 'fail'], q: { k: 'cat', v: 'd' }, n: 20,
        tip: '比減三次、8%／4%，這一塊每年都考。' },
      { t: '履約與驗收', r: ['A0030057', 63, 73], m: [7, 13], g: ['accept'], c: ['sub', 'accept'], q: { k: 'cat', v: 'p' }, n: 20,
        tip: '驗收期限務必分「有無初驗」兩條線各記一次。' },
      { t: '爭議與停權', r: ['A0030057', 74, 86], m: [9, 10, 11], g: ['dispute', 'debar'], c: ['dispute', 'penalty'], q: { k: 'cat', v: 'r' }, n: 20,
        tip: '10／15／15 三個期限 ＋ §101 到 §103 的流程，兩張圖看熟就好。' },
      { t: '罰則、綜合與 GPA', r: ['A0030057', 87, 114], m: [12, 14, 15], g: ['gpa', 'orgs'], c: ['org'], q: { k: 'cat', v: 's' }, n: 20,
        tip: '綜合與 GPA 題數不多，但幾乎都是送分題，別漏掉。' },
      { t: '模擬考 ＋ 錯題總清', r: null, m: [], g: [], c: [], q: { k: 'exam', n: 50, sec: 3600 }, n: 50,
        tip: '先考一次 50 題，再把錯題本清空——這是分數成長最快的一天。' }
    ]
  }
};

function planKey(pid, i) { return pid + ':' + i; }
function planDone() { return LS.get('plan.done', {}); }
function artRangeCount(r) {
  if (!r) return 0;
  const l = LAWBY[r[0]]; if (!l) return 0;
  if (r.length < 3) return l.articles.length;
  return l.articles.filter(a => artNum(a.no) >= r[1] && artNum(a.no) <= r[2]).length;
}
function rangeFirstArt(r) {
  const l = LAWBY[r[0]]; if (!l) return null;
  if (r.length < 3) return l.articles[0];
  return l.articles.find(a => artNum(a.no) >= r[1] && artNum(a.no) <= r[2]) || l.articles[0];
}
function rangeLabel(r) {
  const l = LAWBY[r[0]]; if (!l) return '';
  const nm = esc(l.short || l.title);
  return r.length < 3 ? `${nm}　全 ${l.articles.length} 條`
    : `${nm} §${r[1]}–§${r[2]}　${artRangeCount(r)} 條`;
}
function viewPlan() {
  const plan = PLAN_DEFS[PL.id] || PLAN_DEFS.d30;
  const done = planDone();
  const total = plan.days.length;
  const nd = plan.days.filter((_, i) => done[planKey(PL.id, i)]).length;
  const pct = Math.round(nd / total * 100);
  const nextI = plan.days.findIndex((_, i) => !done[planKey(PL.id, i)]);

  const cards = plan.days.map((d, i) => {
    const k = planKey(PL.id, i);
    const isDone = !!done[k];
    const memos = (d.m || []).map(mi => D.memo[mi]
      ? `<button class="relchip" data-memo="${mi}">記 ${esc(D.memo[mi].t)}</button>` : '').join('');
    const dgs = (d.g || []).map(gi => { const g = D.diagrams.find(x => x.id === gi);
      return g ? `<button class="relchip" data-dg="${gi}" data-dgo="1">圖 ${esc(g.t.split('：')[0])}</button>` : ''; }).join('');
    const cmps = (d.c || []).map(ci => { const c = D.compare.find(x => x.id === ci);
      return c ? `<button class="relchip" data-cmp="${ci}" data-cmpgo="1">比 ${esc(c.t)}</button>` : ''; }).join('');
    const first = d.r ? rangeFirstArt(d.r) : null;
    const qLabel = d.q.k === 'exam' ? `模擬考 ${d.q.n} 題` : `練 ${d.n} 題`;
    return `<article class="planday${isDone ? ' done' : ''}${i === nextI ? ' next' : ''}">
      <div class="dn">DAY ${String(i + 1).padStart(2, '0')}${i === nextI ? '　· 接下來' : ''}</div>
      <h4>${esc(d.t)}</h4>
      <div class="pitems">
        ${d.r ? `<span>讀　<b>${rangeLabel(d.r)}</b></span>` : '<span>讀　—（今天不讀新條文）</span>'}
        ${memos || dgs || cmps ? `<span>看　${(d.m || []).length + (d.g || []).length + (d.c || []).length} 項整理</span>` : ''}
        <span>練　<b>${d.q.k === 'exam' ? '模擬考 ' + d.q.n + ' 題' : d.n + ' 題'}</b></span>
      </div>
      <div class="pacts">
        ${first ? `<a class="relchip" href="#/law/${first.lid}/${first.no}" data-go="${first.lid}#${first.no}">開始讀 →</a>` : ''}
        ${memos}${dgs}${cmps}
        <button class="relchip" data-plan="${i}">${qLabel} →</button>
      </div>
      <p style="font-size:12px;color:var(--ink3);margin:9px 0 0;line-height:1.75">${esc(d.tip)}</p>
      <label><input type="checkbox" data-planchk="${i}" ${isDone ? 'checked' : ''}> 今天完成了</label>
    </article>`;
  }).join('');

  return `<div class="crumb">學習路線</div>
  <div class="lawhead"><h2>讀書計畫</h2>
    <div class="lawmeta"><span>把 ${LAWS.length} 部法規切成每天做得完的份量</span>
      <span class="pill">進度存在這個瀏覽器</span></div></div>
  <div class="planpick">
    ${Object.keys(PLAN_DEFS).map(id => `<button class="chip${PL.id === id ? ' on' : ''}" data-planid="${id}">${esc(PLAN_DEFS[id].name)}</button>`).join('')}
    <button class="chip" data-plan="reset">↺ 清除這個計畫的進度</button>
  </div>
  <div class="planhead">
    <div class="planring" style="--p:${pct}"><i>${pct}%</i></div>
    <div><div style="font-size:15px;font-weight:800">${esc(plan.name)}　${nd} / ${total} 天</div>
      <p style="margin:4px 0 0;font-size:12.5px;color:var(--ink3);line-height:1.8;max-width:62ch">${esc(plan.sub)}</p></div>
  </div>
  <div class="notice">每天的「練 N 題」只會出<b>當天讀的那一段</b>的題目；答錯的會自動進錯題本，
    隔天在<button class="ref" data-qm-go="due">排程複習</button>再出一次。真正的進度是錯題變少，不是天數走完。</div>
  <div class="plandays">${cards}</div>`;
}

/* ================== 模擬考 ================== */
let EXSET = { n: 50, sec: 3600, scope: 'all' };
let EX = LS.get('exam.cur', null);
let examTimer = null;
const saveEX = () => LS.set('exam.cur', EX);

function examScopes() {
  return [['all', '全部'], ['main', '只考採購法'], ['md', '採購法＋細則']].concat(D.cats.map(c => ['c:' + c.id, c.name]));
}
function examStart() {
  let idx = D.quiz.map((q, i) => i);
  if (EXSET.scope === 'main' || EXSET.scope === 'md') idx = idx.filter(i => D.quiz[i].r.indexOf('A003005') === 0);
  else if (EXSET.scope.indexOf('c:') === 0) idx = idx.filter(i => D.quiz[i].c === EXSET.scope.slice(2));
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
  const n = Math.min(EXSET.n, idx.length);
  EX = { n: n, sec: EXSET.sec, scope: EXSET.scope, ids: idx.slice(0, n),
    ans: new Array(n).fill(null), flag: new Array(n).fill(false), i: 0, start: Date.now(), done: false };
  saveEX();
}
function examLeft() { return EX ? Math.max(0, EX.sec - Math.floor((Date.now() - EX.start) / 1000)) : 0; }
function mmss(t) { const m = Math.floor(t / 60), x = t % 60; return String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); }
function examSubmit(auto) {
  if (!EX || EX.done) return;
  EX.done = true; EX.at = Date.now(); EX.used = Math.min(EX.sec, Math.floor((Date.now() - EX.start) / 1000));
  EX.auto = !!auto;
  let right = 0, added = 0;
  EX.ids.forEach((qi, i) => {
    const q = D.quiz[qi];
    const ok = EX.ans[i] === q.a;
    if (ok) right++;
    // 只有「作答了但答錯」才自動標記；沒作答（例如時間不夠）不污染 ★ 我的重點
    else if (EX.ans[i] != null && !marks.has(q.r)) { marks.add(q.r); added++; }
    srsRecord(qi, ok);                       // 交卷後一併進入間隔複習
  });
  saveMarks();
  EX.right = right; EX.added = added;
  const log = LS.get('exam.log', []);
  log.unshift({ at: EX.at, n: EX.n, right: right, sec: EX.used, scope: EX.scope });
  LS.set('exam.log', log.slice(0, 12));
  saveEX();
}
function examCatStats() {
  const by = {};
  EX.ids.forEach((qi, i) => {
    const q = D.quiz[qi];
    by[q.c] = by[q.c] || { n: 0, r: 0 };
    by[q.c].n++;
    if (EX.ans[i] === q.a) by[q.c].r++;
  });
  return by;
}
function viewExam() {
  /* --- 設定畫面 --- */
  if (!EX) {
    const log = LS.get('exam.log', []);
    return `<div class="crumb">工具 · 自我測驗</div>
    <div class="lawhead"><h2>模擬考</h2>
      <div class="lawmeta"><span>一次作答、最後交卷、附分類弱點分析</span>
        <span class="pill r">交卷後答錯的題目會自動進錯題本</span></div></div>
    <div class="notice">與「選擇題」練習不同：作答時<b>不會即時告訴你對錯</b>，可以標記待確認、跳題，時間到自動交卷。
      題目來自本站自製題庫（${D.quiz.length} 題），非官方考古題。</div>
    <div class="examsetup">
      <div class="examfield"><div class="lb">題數</div><div class="chips">
        ${[30, 50, 80].map(n => `<button class="chip${EXSET.n === n ? ' on' : ''}" data-exn="${n}">${n} 題</button>`).join('')}
      </div></div>
      <div class="examfield"><div class="lb">作答時間</div><div class="chips">
        ${[[1800, '30 分'], [3600, '60 分'], [5400, '90 分']].map(([v, t]) => `<button class="chip${EXSET.sec === v ? ' on' : ''}" data-exs="${v}">${t}</button>`).join('')}
      </div></div>
      <div class="examfield"><div class="lb">範圍</div><div class="chips">
        ${examScopes().map(([v, t]) => `<button class="chip${EXSET.scope === v ? ' on' : ''}" data-exsc="${v}">${esc(t)}</button>`).join('')}
      </div></div>
    </div>
    <button class="tbtn on" data-exa="start" style="padding:12px 22px;font-size:14px">開始作答 →</button>
    ${log.length ? `<div style="margin-top:26px">
      <div class="sectitle" style="font-size:15px">歷次成績</div>
      <div class="exhist">${log.map(x => `<span>${new Date(x.at).toLocaleDateString('zh-TW')}　${Math.round(x.right / x.n * 100)}%　(${x.right}/${x.n})</span>`).join('')}</div>
    </div>` : ''}`;
  }

  /* --- 成績單 --- */
  if (EX.done) {
    const pct = Math.round(EX.right / EX.n * 100);
    const by = examCatStats();
    const bars = D.cats.filter(c => by[c.id]).map(c => {
      const b = by[c.id], r = Math.round(b.r / b.n * 100);
      return `<div class="catbar${r < 60 ? ' weak' : ''}">
        <span>${esc(c.code + ' ' + c.name)}</span>
        <span class="tr"><i style="width:${r}%"></i></span>
        <span style="font-family:var(--mono);color:var(--ink3)">${b.r}/${b.n}</span></div>`;
    }).join('');
    const weak = D.cats.filter(c => by[c.id] && by[c.id].r / by[c.id].n < 0.6);
    const review = EX.ids.map((qi, i) => {
      const q = D.quiz[qi], L = ['A', 'B', 'C', 'D'];
      const ok = EX.ans[i] === q.a;
      const lid = q.r.split('#')[0], ano = q.r.split('#')[1];
      const lw = LAWBY[lid];
      return `<div class="exq ${ok ? 'good' : 'bad'}">
        <div class="qn" style="font-size:11.5px;color:var(--ink3)">第 ${i + 1} 題　${ok ? '✓ 答對' : EX.ans[i] == null ? '✗ 未作答' : '✗ 答錯'}</div>
        <div style="font-weight:700;margin:5px 0 7px">${esc(q.q)}</div>
        <div style="font-size:13px;line-height:1.9">
          ${q.o.map((o, oi) => `<div style="${oi === q.a ? 'color:var(--accent);font-weight:700' : EX.ans[i] === oi ? 'color:#c0392b;text-decoration:line-through' : 'color:var(--ink3)'}">${L[oi]}　${esc(o)}</div>`).join('')}
        </div>
        <div class="expl" style="margin-top:9px"><div>${q.e.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>
          ${lw ? `<div style="margin-top:8px"><a class="relchip" href="#/law/${lid}/${ano}" data-go="${q.r}">前往 ${esc(lw.short || lw.title)} ${esc(lw.artBy[ano] ? lw.artBy[ano].label : '')} →</a></div>` : ''}
        </div></div>`;
    }).join('');
    return `<div class="crumb">工具 · 模擬考</div>
    <div class="lawhead"><h2>成績單</h2>
      <div class="lawmeta"><span>${new Date(EX.at).toLocaleString('zh-TW')}</span>
        <span>作答 ${mmss(EX.used)}${EX.auto ? '（時間到自動交卷）' : ''}</span></div></div>
    <div class="examdone">
      <div class="examscore">${pct}<small> 分</small></div>
      <div style="font-size:13px;color:var(--ink2);margin-top:6px">
        答對 <b>${EX.right}</b> ／ ${EX.n} 題　·　未作答 <b>${EX.ans.filter(x => x == null).length}</b> 題
        ${EX.added ? `　·　已把 <b>${EX.added}</b> 條答錯的條文加入 ★ 我的重點` : ''}</div>
      <div class="catbars">${bars}</div>
      ${weak.length ? `<div class="notice" style="margin-bottom:0">最弱的是
        <b>${weak.map(c => esc(c.name)).join('、')}</b>。建議回到
        ${weak.map(c => `<button class="ref" data-cat="${c.id}">${esc(c.code + c.name)}</button>`).join(' ')}
        重讀一次，再用<button class="ref" data-qm-go="wrong">錯題本</button>把這次的錯題清掉。</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
        <button class="tbtn on" data-exa="again">再考一次</button>
        <button class="tbtn" data-qm-go="wrong">去清錯題本（${srsStats().wrong}）</button>
        <button class="tbtn" data-exa="print">列印成績單</button>
      </div>
    </div>
    <div class="sectitle">逐題檢討</div>
    <p class="secsub">答錯的題目已經進入間隔複習排程，明天會在「排程複習」再出現一次。</p>
    ${review}`;
  }

  /* --- 作答中 --- */
  const i = EX.i, qi = EX.ids[i], q = D.quiz[qi], L = ['A', 'B', 'C', 'D'];
  const left = examLeft();
  const answered = EX.ans.filter(x => x != null).length;
  return `<div class="exambar">
      <span class="examclock${left < 300 ? ' warn' : ''}" id="examClock">${mmss(left)}</span>
      <span style="font-size:12.5px;color:var(--ink3)">已作答 <b style="color:var(--ink)">${answered}</b> / ${EX.n}</span>
      <button class="chip" data-exa="submit">交卷</button>
      <button class="chip" data-exa="quit">放棄本次</button>
    </div>
    <div class="examnav" style="margin-bottom:16px">
      ${EX.ids.map((_, j) => `<button class="qdot${EX.ans[j] != null ? ' ans' : ''}${EX.flag[j] ? ' flag' : ''}${j === i ? ' cur' : ''}" data-exg="${j}">${j + 1}</button>`).join('')}
    </div>
    <div class="fcwrap" style="max-width:720px"><div class="mcq">
      <div class="qn">第 ${i + 1} / ${EX.n} 題
        <button class="ref" data-exa="flag" style="float:right">${EX.flag[i] ? '★ 已標記待確認' : '☆ 標記待確認'}</button></div>
      <div class="qt">${esc(q.q)}</div>
      <div class="opts">${q.o.map((o, oi) => `<button class="opt${EX.ans[i] === oi ? ' sel' : ''}" data-expick="${oi}">
        <span class="lt">${L[oi]}</span><span>${esc(o)}</span></button>`).join('')}</div>
      </div>
      <div class="fcbar">
        <button class="tbtn" data-exa="prev" ${i === 0 ? 'disabled style="opacity:.4"' : ''}>← 上一題</button>
        <button class="tbtn" data-exa="clear">清除本題</button>
        <button class="tbtn on" data-exa="next">${i === EX.n - 1 ? '回到第 1 題' : '下一題 →'}</button>
      </div>
    </div>`;
}
function examTick() {
  if (!EX || EX.done || S.view !== 'exam') return;
  const el = $('#examClock'); if (!el) return;
  const left = examLeft();
  el.textContent = mmss(left);
  el.classList.toggle('warn', left < 300);
  if (left <= 0) { examSubmit(true); render(); }
}

/* ================== 金額與期限試算 ================== */
const AMT = { small: 150000, pub: 1500000,
  check: { 工程: 50000000, 財物: 50000000, 勞務: 10000000 },
  huge: { 工程: 200000000, 財物: 100000000, 勞務: 20000000 } };
let CALC = { tab: 'money', amt: 15000000, kind: '工程', mode: 'open',
  pre: false, e1: false, e2: false, urgent: false,
  dtype: 'doc', date: '', period: 14, bidDate: '', acc: 'with', accDate: '' };

function nt(n) { return '$' + Number(n).toLocaleString('en-US'); }
function wan(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 ? 2 : 0) + ' 億';
  if (n >= 10000) return (n / 10000).toFixed(n % 10000 ? 1 : 0) + ' 萬';
  return n + ' 元';
}
function tierOf(amt, kind) {
  const chk = AMT.check[kind], hug = AMT.huge[kind];
  if (amt <= AMT.small) return { id: 'small', t: '中央機關小額採購', d: '未達公告金額十分之一（15 萬元以下）' };
  if (amt < AMT.pub) return { id: 'under', t: '未達公告金額', d: '15 萬元以上、未達 150 萬元' };
  if (amt < chk) return { id: 'pub', t: '公告金額以上，未達查核金額', d: `150 萬元以上、未達 ${wan(chk)}` };
  if (amt < hug) return { id: 'chk', t: '查核金額以上，未達巨額', d: `${wan(chk)} 以上、未達 ${wan(hug)}` };
  return { id: 'huge', t: '巨額採購', d: `${wan(hug)} 以上` };
}
function baseDays(mode, tier) {
  if (mode === 'open' || mode === 'eval') {
    return { d: { small: 7, under: 7, pub: 14, chk: 21, huge: 28 }[tier.id],
      src: ['A0030093', mode === 'open' ? '2' : '4'],
      why: mode === 'open' ? '招標期限標準 §2Ⅱ：未達公告金額 7 日、公告金額以上未達查核 14 日、查核以上未達巨額 21 日、巨額 28 日。'
        : '§22Ⅰ⑨⑩ 公開評選，依招標期限標準 §4Ⅰ 準用 §2 的期限。' };
  }
  if (mode === 'sel') {
    return { d: { small: 7, under: 7, pub: 10, chk: 10, huge: 14 }[tier.id], src: ['A0030093', '3'],
      why: '招標期限標準 §3Ⅱ（資格預先審查）：未達公告金額 7 日、公告金額以上未達巨額 10 日、巨額 14 日。' };
  }
  if (mode === 'solicit') return { d: 10, src: ['A0030093', '4'], fixed: true,
    why: '招標期限標準 §4Ⅱ：§22Ⅰ⑪ 公開徵求，應訂 10 日以上；第二次以後不得少於 5 日。' };
  if (mode === 'q49') return { d: 5, src: ['A0030093', '5'], fixed: true,
    why: '招標期限標準 §5：依 §49 公開徵求書面報價或企劃書，應訂 5 日以上之合理期限。' };
  return { d: null, src: ['A0030093', '6'], fixed: true,
    why: '招標期限標準 §6：限制性招標未經公開評選或公開徵求者，等標期由機關視需要合理訂定。' };
}
function calcMoney() {
  const amt = Math.max(0, Number(CALC.amt) || 0);
  const kind = CALC.kind;
  const tier = tierOf(amt, kind);
  const b = baseDays(CALC.mode, tier);
  const steps = [];
  let days = b.d, floor = 0;
  if (days != null && !b.fixed) {
    steps.push(`基本等標期：<b>${days} 日</b>（${tier.t}）`);
    let cut = 0;
    if (CALC.pre) { cut += 5; floor = Math.max(floor, 10); steps.push('招標文件稿辦理公開閱覽，縮短 5 日（縮短後不得少於 10 日）'); }
    if (CALC.e1) { cut += 3; floor = Math.max(floor, 5); steps.push('電子領標並於公告敘明，縮短 3 日（不得少於 5 日）'); }
    if (CALC.e2) { cut += 2; floor = Math.max(floor, 5); steps.push('電子投標並於公告或招標文件敘明，縮短 2 日（不得少於 5 日）'); }
    if (CALC.urgent && tier.id !== 'small' && tier.id !== 'under') { floor = Math.max(floor, 10); steps.push('因應緊急情事縮短（§4-1），但縮短後不得少於 10 日'); }
    if (cut) { const raw = days - cut; days = Math.max(raw, floor);
      steps.push(`${b.d} − ${cut} = ${raw} 日${raw < floor ? `，低於下限 ${floor} 日，取 <b>${floor} 日</b>` : ''}`); }
  }
  const duties = [];
  if (tier.id === 'small') {
    duties.push('得不經公告程序，逕洽廠商採購（§49 以下之簡化程序，依各機關內部規定）');
    duties.push('免上網公告招標（但 <b>決標結果</b> 仍依 §61、細則 §84 之規定辦理）');
  } else if (tier.id === 'under') {
    duties.push('得依「中央機關未達公告金額採購招標辦法」辦理（§49、§22Ⅰ⑭）');
    duties.push('公開取得三家以上廠商書面報價或企劃書時，公告期限依招標期限標準 §5 為 5 日以上');
    duties.push('監辦：依「中央機關未達公告金額採購監辦辦法」，得由機關自行認定是否派員監辦');
  } else {
    duties.push('應公開招標為原則；採選擇性或限制性招標須有 §18～§22 的法定依據');
    duties.push('應刊登政府採購公報並於政府電子採購網公告（§27）');
    duties.push('監辦：應依 §13 由主（會）計及有關單位會同監辦');
  }
  if (tier.id === 'chk' || tier.id === 'huge') {
    duties.push('<b>查核金額以上</b>：招標文件應於公告前送上級機關備查；開標、決標、驗收應報請上級機關派員監辦（§12Ⅰ）');
    duties.push('減價收受應先報經上級機關核准（§72Ⅱ）');
  }
  if (tier.id === 'huge') {
    duties.push('<b>巨額採購</b>：得訂定特定資格（投標廠商資格與特殊或巨額採購認定標準 §5）');
    duties.push('使用期間應逐年提報使用情形及效益分析（§111）');
  }
  const src = (lid, no, t) => `<a class="relchip" href="#/law/${lid}/${no}" data-go="${lid}#${no}">${t}</a>`;
  return `<div class="res"><h4>金額級距</h4>
      <div class="big">${esc(tier.t)}<small>　${esc(tier.d)}</small></div>
      <ul><li>採購金額：${nt(amt)}（${wan(amt)}）　·　${esc(kind)}採購</li>
        <li>公告金額 150 萬　·　查核金額 ${wan(AMT.check[kind])}　·　巨額 ${wan(AMT.huge[kind])}</li></ul>
      <div class="src">${src('GL000093', '全文', '111.12.23 金額公告')}${src('A0030099', '8', '巨額認定標準 §8')}${src('A0030057', '12', '採購法 §12')}${src('A0030057', '13', '§13')}</div>
    </div>
    <div class="res"><h4>等標期下限</h4>
      <div class="big">${days == null ? '由機關合理訂定' : days + ' 日'}
        <small>　${{ open: '公開招標', sel: '選擇性招標（資格預審）', eval: '公開評選 §22Ⅰ⑨⑩', solicit: '公開徵求 §22Ⅰ⑪', q49: '§49 公開取得報價／企劃書', limited: '限制性招標' }[CALC.mode]}</small></div>
      ${steps.length ? `<ol class="steps">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}
      <ul><li>${b.why}</li>
        <li>等標期自公告日或邀標日起算，<b>當日算入</b>；截止日為例假日者以次日代之（招標期限標準 §11）。</li></ul>
      <div class="src">${src('A0030093', '2', '期限標準 §2')}${src('A0030093', '3', '§3')}${src('A0030093', '9', '§9 縮短')}${src('A0030093', '11', '§11 起算')}</div>
    </div>
    <div class="res"><h4>跨過這條線，多了哪些義務</h4>
      <ul>${duties.map(x => `<li>${x}</li>`).join('')}</ul>
      <div class="src">${src('A0030057', '12', '§12 查核金額')}${src('A0030057', '13', '§13 監辦')}${src('A0030057', '18', '§18 招標方式')}${src('A0030057', '22', '§22')}</div>
    </div>
    <div class="res"><h4>對招標文件提出異議的期限</h4>
      <div class="big">${days == null ? '—' : Math.max(10, Math.ceil(days / 4)) + ' 日'}<small>　自公告或邀標之次日起算</small></div>
      <ul><li>§75Ⅰ①：等標期之四分之一，尾數不足一日以一日計，<b>但不得少於十日</b>。</li>
        ${days != null ? `<li>${days} ÷ 4 = ${(days / 4).toFixed(2)} → 進位 ${Math.ceil(days / 4)} 日${Math.ceil(days / 4) < 10 ? ' → 未滿 10 日，以 <b>10 日</b> 計' : ''}</li>` : ''}</ul>
      <div class="src">${src('A0030057', '75', '採購法 §75')}</div>
    </div>`;
}
function dparse(v) { const d = new Date(v + 'T00:00:00'); return isNaN(d) ? null : d; }
function dadd(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function dfmt(d) {
  const w = '日一二三四五六'[d.getDay()];
  const we = d.getDay() === 0 || d.getDay() === 6;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}（週${w}）${we ? '　<b style="color:var(--gold)">例假日，順延至次一上班日</b>' : ''}`;
}
function calcDate() {
  const src = (lid, no, t) => `<a class="relchip" href="#/law/${lid}/${no}" data-go="${lid}#${no}">${t}</a>`;
  const base = dparse(CALC.date);
  const hint = '<li>採購法的期限多為「<b>次日起算</b>」，因此到期日＝起算事由發生日 ＋ N 日。</li>' +
    '<li>末日為星期例假日、國定假日或其他休息日者，以次日代之；國定假日請自行對照行事曆。</li>';
  let out = '';
  if (CALC.dtype === 'doc') {
    const p = Math.max(1, Number(CALC.period) || 0);
    const q = Math.max(10, Math.ceil(p / 4));
    out = `<div class="res"><h4>對招標文件規定提出異議</h4>
      <div class="big">${q} 日<small>　自公告或邀標之次日起算</small></div>
      <ol class="steps"><li>等標期 ${p} 日 ÷ 4 = ${(p / 4).toFixed(2)} 日</li>
        <li>尾數不足一日以一日計 → ${Math.ceil(p / 4)} 日</li>
        <li>${Math.ceil(p / 4) < 10 ? '未滿十日，依但書以 <b>10 日</b> 計' : '已滿十日，即為 <b>' + q + ' 日</b>'}</li>
        ${base ? `<li>公告或邀標日 ${CALC.date} → 異議期限至 <b>${dfmt(dadd(base, q))}</b></li>` : ''}</ol>
      <ul>${hint}</ul>
      <div class="src">${src('A0030057', '75', '§75Ⅰ①')}${src('A0030093', '2', '等標期 §2')}</div></div>`;
  } else if (CALC.dtype === 'clarify' || CALC.dtype === 'result') {
    const t = CALC.dtype === 'clarify' ? '對招標文件之釋疑、後續說明、變更或補充' : '對採購之過程或結果';
    const law = CALC.dtype === 'clarify' ? '§75Ⅰ②' : '§75Ⅰ③';
    const cap = CALC.dtype === 'result' && dparse(CALC.bidDate) ? dadd(dparse(CALC.bidDate), 15) : null;
    out = `<div class="res"><h4>${esc(t)}提出異議</h4>
      <div class="big">10 日<small>　自接獲通知或機關公告之次日起算</small></div>
      ${base ? `<ol class="steps"><li>接獲通知／公告日：${CALC.date}</li>
        <li>異議期限至 <b>${dfmt(dadd(base, 10))}</b></li>
        ${cap ? `<li>另有上限：過程或結果未經通知或公告者，至遲不得逾決標日之次日起 15 日
          → <b>${dfmt(cap)}</b>，兩者<b>取較早</b>者</li>` : ''}</ol>` : ''}
      <ul>${hint}</ul>
      <div class="src">${src('A0030057', '75', '採購法 ' + law)}</div></div>`;
  } else if (CALC.dtype === 'appeal') {
    out = `<div class="res"><h4>提起申訴</h4>
      <div class="big">15 日<small>　自收受異議處理結果或處理期限屆滿之次日起算</small></div>
      ${base ? `<ol class="steps"><li>收受異議處理結果（或機關處理期限屆滿）日：${CALC.date}</li>
        <li>申訴期限至 <b>${dfmt(dadd(base, 15))}</b></li></ol>` : ''}
      <ul><li>機關應自<b>收受異議之次日起 15 日內</b>為適當處理並書面通知廠商（§75Ⅱ）；逾期未處理即可申訴。</li>
        <li>限<b>公告金額以上</b>之採購；但爭議屬 §31 不發還或追繳押標金者，不受此限（§76Ⅳ）。</li>${hint}</ul>
      <div class="src">${src('A0030057', '75', '§75Ⅱ')}${src('A0030057', '76', '§76')}${src('A0030097', '2', '申訴審議規則')}</div></div>`;
  } else if (CALC.dtype === 'accept') {
    const withPre = CALC.acc === 'with';
    out = `<div class="res"><h4>驗收時程（${withPre ? '有初驗程序' : '無初驗程序'}）</h4>
      ${withPre ? `<ol class="steps">
        <li>廠商於竣工日前或當日書面通知 → 機關自<b>收到通知之日起 7 日內</b>會同核對是否竣工
          ${base ? `→ ${dfmt(dadd(base, 7))}` : ''}</li>
        <li>監造單位於<b>竣工後 7 日內</b>送竣工圖表、結算明細表等資料</li>
        <li>機關自<b>收受全部資料之日起 30 日內</b>辦理初驗並作成初驗紀錄</li>
        <li>初驗合格後<b>20 日內</b>辦理驗收並作成驗收紀錄</li></ol>`
      : `<ol class="steps">
        <li>接獲廠商通知備驗，或可得驗收之程序完成</li>
        <li>機關應於<b>30 日內</b>辦理驗收並作成驗收紀錄
          ${base ? `→ ${dfmt(dadd(base, 30))}` : ''}</li></ol>`}
      <ul><li>以上均為「除契約另有規定者外」；有特殊情形必須延期者，應經機關首長或授權人員核准（細則 §95）。</li>
        <li>驗收結果不符規定時，依 §72 通知限期改善、拆除、重作、退貨或換貨；改善完成後應<b>再行辦理驗收</b>（細則 §97）。</li></ul>
      <div class="src">${src('A0030058', '92', '細則 §92')}${src('A0030058', '93', '§93')}${src('A0030058', '94', '§94')}${src('A0030057', '71', '採購法 §71')}${src('A0030057', '72', '§72')}</div></div>
      <div class="res"><h4>付款期限（§73-1）</h4>
      <div class="big">15 ＋ 15 工作日<small>　估驗／分階段付款</small></div>
      <ul><li>定期估驗或分階段付款：提出估驗或階段完成證明後 <b>15 日</b>內完成審核；接到請款單據後 <b>15 日</b>內付款。</li>
        <li>驗收付款：驗收合格填具結算驗收證明文件，接到請款單據後 <b>15 日</b>內付款。</li>
        <li>應向上級機關申請核撥補助款者，前二款期限為 <b>30 日</b>。</li>
        <li>上述日數為<b>實際工作日</b>，不含例假日、特定假日及退請受款人補正之日數，故不做日曆日換算。</li>
        <li>財物及勞務採購準用之。</li></ul>
      <div class="src">${src('A0030057', '73-1', '採購法 §73-1')}</div></div>`;
  }
  return out || '<div class="res">請選擇要計算的期限類型。</div>';
}
function viewCalc() {
  const money = CALC.tab === 'money';
  const form = money ? `
    <label class="first">採購金額（新臺幣元）</label>
    <input type="number" inputmode="numeric" min="0" step="1000" value="${CALC.amt}" data-calc="amt">
    <div class="hintamt">${nt(CALC.amt || 0)}　＝　${wan(Number(CALC.amt) || 0)}</div>
    <div class="row">${[150000, 1500000, 10000000, 50000000, 100000000, 200000000]
      .map(v => `<button class="chip" data-calcamt="${v}">${wan(v)}</button>`).join('')}</div>
    <label>採購類型</label>
    <div class="row">${['工程', '財物', '勞務'].map(k => `<button class="chip${CALC.kind === k ? ' on' : ''}" data-calckind="${k}">${k}</button>`).join('')}</div>
    <label>招標方式</label>
    <select data-calc="mode">
      ${[['open', '公開招標'], ['sel', '選擇性招標（資格預先審查）'], ['eval', '公開評選 §22Ⅰ⑨⑩'],
         ['solicit', '公開徵求 §22Ⅰ⑪'], ['q49', '§49 公開取得書面報價／企劃書'], ['limited', '限制性招標（未經公開評選或徵求）']]
        .map(([v, t]) => `<option value="${v}"${CALC.mode === v ? ' selected' : ''}>${t}</option>`).join('')}
    </select>
    <label>等標期縮短事由（招標期限標準 §9、§4-1）</label>
    <div class="row">
      <button class="chip${CALC.pre ? ' on' : ''}" data-calctg="pre">公開閱覽 −5</button>
      <button class="chip${CALC.e1 ? ' on' : ''}" data-calctg="e1">電子領標 −3</button>
      <button class="chip${CALC.e2 ? ' on' : ''}" data-calctg="e2">電子投標 −2</button>
      <button class="chip${CALC.urgent ? ' on' : ''}" data-calctg="urgent">緊急情事</button>
    </div>` : `
    <label class="first">要算哪一個期限</label>
    <select data-calc="dtype">
      ${[['doc', '異議：對招標文件規定'], ['clarify', '異議：對釋疑、變更或補充'], ['result', '異議：對採購過程或結果'],
         ['appeal', '申訴：對異議處理結果不服'], ['accept', '驗收與付款時程']]
        .map(([v, t]) => `<option value="${v}"${CALC.dtype === v ? ' selected' : ''}>${t}</option>`).join('')}
    </select>
    ${CALC.dtype === 'doc' ? `<label>該案等標期（日）</label>
      <input type="number" min="1" value="${CALC.period}" data-calc="period">` : ''}
    ${CALC.dtype === 'accept' ? `<label>有無初驗程序</label>
      <div class="row">
        <button class="chip${CALC.acc === 'with' ? ' on' : ''}" data-calcacc="with">有初驗</button>
        <button class="chip${CALC.acc === 'no' ? ' on' : ''}" data-calcacc="no">無初驗</button>
      </div>` : ''}
    <label>${CALC.dtype === 'doc' ? '公告或邀標日' : CALC.dtype === 'appeal' ? '收受異議處理結果日'
      : CALC.dtype === 'accept' ? (CALC.acc === 'with' ? '收到竣工通知日' : '接獲備驗通知日') : '接獲通知或公告日'}（可不填）</label>
    <input type="date" value="${esc(CALC.date)}" data-calc="date">
    ${CALC.dtype === 'result' ? `<label>決標日（未經通知或公告時的上限）</label>
      <input type="date" value="${esc(CALC.bidDate)}" data-calc="bidDate">` : ''}`;

  return `<div class="crumb">工具</div>
  <div class="lawhead"><h2>金額與期限試算</h2>
    <div class="lawmeta"><span>把規則算給你看，每個結果都附法源</span>
      <span class="pill r">學習輔助，實務請以最新法規與主管機關函釋為準</span></div></div>
  <div class="scoperow" style="margin:0 0 16px">
    <span class="lbl">類型</span>
    <button class="chip${money ? ' on' : ''}" data-calctab="money">金額級距 · 等標期</button>
    <button class="chip${!money ? ' on' : ''}" data-calctab="date">異議 · 申訴 · 驗收期限</button>
  </div>
  <div class="calcwrap">
    <form class="calcform" onsubmit="return false">${form}</form>
    <div id="calcres">${money ? calcMoney() : calcDate()}</div>
  </div>`;
}

/* ================== 路由 / 渲染 ================== */
function render() {
  const v = $('#view');
  let html;
  if (S.q) { S.view = 'search'; html = viewSearch(S.q); }
  else if (S.view === 'law') html = viewLaw(S.lid, S.cat);
  else if (S.view === 'cat') html = viewCat(S.cat);
  else if (S.view === 'journey') html = journeyView();
  else if (S.view === 'plan') html = viewPlan();
  else if (S.view === 'exam') html = viewExam();
  else if (S.view === 'calc') html = viewCalc();
  else if (S.view === 'memo') html = viewMemo();
  else if (S.view === 'cmp') html = viewCmp();
  else if (S.view === 'cmp2') html = viewCompare();
  else if (S.view === 'dg') html = viewDiagrams();
  else if (S.view === 'lt') html = viewLetters();
  else if (S.view === 'quiz') html = viewQuiz();
  else if (S.view === 'marks') html = viewMarks();
  else html = viewHome();
  v.innerHTML = html;
  syncNav();
  updateScopeChips();
  syncHash();
}

/* ================== 網址路由 ==================
   每個畫面都有自己的網址：可加書籤、可貼給同事、上一頁會回上一層，
   重新整理也會留在原地。 */
let curHash = null, routing = false;
function hashOf() {
  if (S.q) return '#/search/' + encodeURIComponent(S.q);
  switch (S.view) {
    case 'law':  return '#/law/' + S.lid + (S.anchor ? '/' + S.anchor : '');
    case 'cat':  return '#/cat/' + S.cat;
    case 'dg':   return '#/dg' + (DG.id ? '/' + DG.id : '');
    case 'cmp2': return '#/compare' + (CMP.id ? '/' + CMP.id : '');
    case 'memo': return '#/memo' + (MEMO.id != null ? '/' + MEMO.id : '');
    case 'lt':   return '#/letters' + (LT.art ? '/' + LT.art : '');
    case 'plan': return '#/plan/' + PL.id;
    case 'home': return '#/';
    default:     return '#/' + S.view;
  }
}
function applyHash(h) {
  const seg = String(h || '').replace(/^#\/?/, '').split('/').filter(x => x !== '');
  const k = seg[0] || '';
  const qbox = $('#q');
  S.q = ''; S.anchor = null;
  if (qbox) qbox.value = '';
  if (k === 'search') {
    S.q = decodeURIComponent(seg.slice(1).join('/') || '');
    if (qbox) qbox.value = S.q;
    S.view = 'search'; return;
  }
  if (k === 'law' && LAWBY[seg[1]]) {
    const l = LAWBY[seg[1]];
    S.lid = l.id;
    const a = seg[2] ? l.artBy[seg[2]] : null;
    S.cat = a ? a.cat : l.articles[0].cat;
    S.anchor = a ? seg[2] : null;
    S.view = 'law'; return;
  }
  if (k === 'cat' && D.cats.some(c => c.id === seg[1])) { S.cat = seg[1]; S.lid = null; S.view = 'cat'; return; }
  if (k === 'dg') { if (seg[1]) DG.id = seg[1]; S.view = 'dg'; return; }
  if (k === 'compare') { if (seg[1]) CMP.id = seg[1]; S.view = 'cmp2'; return; }
  if (k === 'memo') { MEMO.id = (seg[1] != null && seg[1] !== '') ? +seg[1] : null; S.view = 'memo'; return; }
  if (k === 'letters') { LT.art = seg[1] || null; LT.q = ''; LT.limit = 60; S.view = 'lt'; return; }
  if (k === 'plan') { if (PLAN_DEFS[seg[1]]) { PL.id = seg[1]; LS.set('plan.cur', PL.id); } S.view = 'plan'; return; }
  if (['journey', 'cmp', 'quiz', 'marks', 'exam', 'calc'].indexOf(k) >= 0) { S.view = k; return; }
  S.view = 'home'; S.lid = null; S.cat = null;
}
function syncHash() {
  if (routing) return;
  const h = hashOf();
  if (location.hash === h) { curHash = h; return; }
  curHash = h;
  try { history.pushState(null, '', h); } catch (e) { location.hash = h; }
}
function onRoute() {
  if (location.hash === curHash) return;
  curHash = location.hash;
  routing = true;
  applyHash(location.hash);
  render();
  routing = false;
  if (S.view === 'law' && S.anchor) flashArt(S.lid, S.anchor);
  else window.scrollTo({ top: 0 });
  closeSide();
}
window.addEventListener('popstate', onRoute);
window.addEventListener('hashchange', onRoute);

function flashArt(lid, no) {
  requestAnimationFrame(() => {
    const el = document.getElementById('a-' + lid + '-' + no);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2200);
    } else window.scrollTo({ top: 0 });
  });
}
function updateScopeChips() {
  $$('#scoperow .chip[data-scope]').forEach(b => {
    b.classList.toggle('on', b.dataset.scope === S.scope);
    if (b.dataset.scope === 'law') { b.disabled = !S.lid; b.style.opacity = S.lid ? 1 : .4; }
    if (b.dataset.scope === 'cat') { b.disabled = !S.cat; b.style.opacity = S.cat ? 1 : .4; }
  });
}
function goto(key) {
  const [lid, no] = key.split('#');
  const l = LAWBY[lid]; if (!l) return;
  const a = l.artBy[no];
  S.q = ''; $('#q').value = '';
  S.lid = lid; S.cat = a ? a.cat : l.articles[0].cat; S.anchor = a ? no : null; S.view = 'law';
  render();
  flashArt(lid, no);
  closeSide();
}
function closeSide() { $('#side').classList.remove('open'); $('#scrim').classList.remove('on'); }

/* ================== 事件 ================== */
let tmr = null;
$('#q').addEventListener('input', e => {
  clearTimeout(tmr);
  const val = e.target.value;
  tmr = setTimeout(() => { S.q = val.trim(); render(); window.scrollTo({ top: 0 }); }, 130);
});
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.target.value = ''; S.q = ''; S.view = S.lid ? 'law' : 'home'; render(); }
});
$$('#scoperow .chip[data-scope]').forEach(b => b.addEventListener('click', () => {
  S.scope = b.dataset.scope;
  if (S.scope === 'mark' && !S.q) { S.view = 'marks'; }
  render();
}));
$('#btnCmp').addEventListener('click', () => { S.q = ''; $('#q').value = ''; S.view = 'cmp2'; render(); window.scrollTo({top:0}); });
$('#btnDg').addEventListener('click', () => { S.q = ''; $('#q').value = ''; S.view = 'dg'; render(); window.scrollTo({top:0}); });
$('#btnMemo').addEventListener('click', () => { S.q = ''; $('#q').value = ''; S.view = 'memo'; render(); window.scrollTo({top:0}); });
$('#btnQuiz').addEventListener('click', () => { S.q = ''; $('#q').value = ''; S.view = 'quiz'; render(); window.scrollTo({top:0}); });
$('#btnCalc').addEventListener('click', () => { S.q = ''; $('#q').value = ''; S.view = 'calc'; render(); window.scrollTo({top:0}); });
$('#btnTheme').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const nx = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nx); LS.set('theme', nx);
});
$('#fabTop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
$('#fabPrint').addEventListener('click', () => window.print());
$('#mob').addEventListener('click', () => { $('#side').classList.toggle('open'); $('#scrim').classList.toggle('on'); });
$('#scrim').addEventListener('click', closeSide);

document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-cat],[data-law],[data-view],[data-home],[data-mark],[data-copy],[data-qa],[data-qs],[data-qm],[data-pick],[data-cmp],[data-dg],[data-lt],[data-ltmore],[data-memo],[data-plan],[data-planid],[data-qm-go],[data-exn],[data-exs],[data-exsc],[data-exa],[data-exg],[data-expick],[data-calctab],[data-calckind],[data-calcamt],[data-calctg],[data-calcacc],#clearMarks,#btnExport,#btnImport');
  if (!t) return;
  if (t.dataset.go) {
    // 連結型的條文引用：按住 Ctrl / ⌘ 或中鍵仍可用瀏覽器開新分頁
    if (t.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
    e.preventDefault();
    goto(t.dataset.go); return;
  }
  if (t.id === 'clearMarks') { if (confirm('確定清除全部標記？')) { marks.clear(); saveMarks(); render(); } return; }
  if (t.dataset.mark) {
    const k = t.dataset.mark;
    if (marks.has(k)) marks.delete(k); else marks.add(k);
    saveMarks();
    const art = t.closest('.art');
    art.classList.toggle('marked', marks.has(k));
    t.classList.toggle('act', marks.has(k));
    t.textContent = marks.has(k) ? '★' : '☆';
    const mn = $('#markN'); if (mn) mn.textContent = marks.size;
    return;
  }
  if (t.dataset.copy) {
    const [lid, no] = t.dataset.copy.split('#');
    const a = LAWBY[lid].artBy[no];
    const txt = LAWBY[lid].title + ' ' + a.label + '\n' + a.lines.join('\n');
    navigator.clipboard && navigator.clipboard.writeText(txt);
    t.textContent = '✓'; setTimeout(() => t.textContent = '⧉', 1100);
    return;
  }
  if (t.dataset.law) { S.q = ''; $('#q').value = ''; S.lid = t.dataset.law; S.cat = t.dataset.lcat || LAWBY[S.lid].articles[0].cat; S.view = 'law'; render(); window.scrollTo({ top: 0 }); closeSide(); return; }
  if (t.dataset.cat) {
    S.q = ''; $('#q').value = '';
    if (S.view === 'cat' && S.cat === t.dataset.cat) { const box = $(`[data-laws="${t.dataset.cat}"]`); if (box) box.classList.toggle('hidden'); return; }
    S.cat = t.dataset.cat; S.lid = null; S.view = 'cat'; render(); window.scrollTo({ top: 0 }); closeSide(); return;
  }
  if (t.dataset.home !== undefined && t.hasAttribute('data-home')) { S.q = ''; $('#q').value = ''; S.view = 'home'; S.lid = null; S.cat = null; render(); window.scrollTo({ top: 0 }); closeSide(); return; }
  if (t.dataset.view) {
    S.q = ''; $('#q').value = '';
    if (t.dataset.view === 'lt') { LT.art = null; LT.q = ''; LT.limit = 60; }   // 從側欄進入＝重新瀏覽全部
    S.view = t.dataset.view; render(); window.scrollTo({ top: 0 }); closeSide(); return;
  }
  if (t.dataset.cmp) { CMP.id = t.dataset.cmp; if (t.dataset.cmpgo) { S.q = ''; $('#q').value = ''; S.view = 'cmp2'; } render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.dataset.dg) { DG.id = t.dataset.dg; if (t.dataset.dgo) { S.q = ''; $('#q').value = ''; S.view = 'dg'; } render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.dataset.memo != null && t.hasAttribute('data-memo')) {
    S.q = ''; $('#q').value = ''; MEMO.id = +t.dataset.memo; S.view = 'memo'; render();
    requestAnimationFrame(() => { const el = document.getElementById('memo-' + MEMO.id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    closeSide(); return;
  }
  if (t.hasAttribute('data-lt')) {
    LT.art = t.dataset.lt || null; LT.limit = 60;
    if (t.dataset.ltq != null) LT.q = t.dataset.ltq;
    else if (t.dataset.ltgo) LT.q = '';
    S.q = ''; $('#q').value = ''; S.view = 'lt'; render(); window.scrollTo({ top: 0 }); return;
  }
  if (t.dataset.ltmore) { LT.limit += 60; render(); return; }

  /* ---- 讀書計畫 ---- */
  if (t.dataset.planid) { PL.id = t.dataset.planid; LS.set('plan.cur', PL.id); render(); window.scrollTo({ top: 0 }); return; }
  if (t.dataset.plan != null && t.hasAttribute('data-plan')) {
    if (t.dataset.plan === 'reset') {
      if (confirm('確定清除「' + PLAN_DEFS[PL.id].name + '」的完成紀錄？（條文標記與題目紀錄不受影響）')) {
        const dn = planDone();
        Object.keys(dn).forEach(k => { if (k.indexOf(PL.id + ':') === 0) delete dn[k]; });
        LS.set('plan.done', dn); render();
      }
      return;
    }
    const day = PLAN_DEFS[PL.id].days[+t.dataset.plan];
    if (!day) return;
    S.q = ''; $('#q').value = '';
    if (day.q.k === 'exam') {
      EXSET = { n: day.q.n, sec: day.q.sec, scope: 'all' };
      EX = null; saveEX(); S.view = 'exam';
    } else if (day.q.k === 'range' && day.r) {
      QZ.mode = 'range';
      QZ.range = day.r.length < 3
        ? { lid: day.r[0], from: 0, to: 99999 }
        : { lid: day.r[0], from: day.r[1], to: day.r[2] };
      buildPool(); S.view = 'quiz';
    } else {
      QZ.mode = 'mcq'; QZ.scope = day.q.v ? 'c:' + day.q.v : 'all'; QZ.range = null;
      buildPool(); S.view = 'quiz';
    }
    render(); window.scrollTo({ top: 0 }); return;
  }
  if (t.dataset.qmGo) { S.q = ''; $('#q').value = ''; QZ.mode = t.dataset.qmGo; buildPool(); S.view = 'quiz'; render(); window.scrollTo({ top: 0 }); return; }

  /* ---- 模擬考 ---- */
  if (t.dataset.exn) { EXSET.n = +t.dataset.exn; render(); return; }
  if (t.dataset.exs) { EXSET.sec = +t.dataset.exs; render(); return; }
  if (t.dataset.exsc) { EXSET.scope = t.dataset.exsc; render(); return; }
  if (t.dataset.exg) { EX.i = +t.dataset.exg; saveEX(); render(); return; }
  if (t.dataset.expick != null && t.hasAttribute('data-expick')) {
    EX.ans[EX.i] = (EX.ans[EX.i] === +t.dataset.expick) ? null : +t.dataset.expick;
    saveEX(); render(); return;
  }
  if (t.dataset.exa) {
    const a = t.dataset.exa;
    if (a === 'start') { examStart(); render(); window.scrollTo({ top: 0 }); return; }
    if (a === 'again') { EX = null; saveEX(); render(); window.scrollTo({ top: 0 }); return; }
    if (a === 'print') { window.print(); return; }
    if (a === 'quit') { if (confirm('放棄本次模擬考？作答內容不會計分，也不會進入錯題本。')) { EX = null; saveEX(); render(); } return; }
    if (a === 'submit') {
      const un = EX.ans.filter(x => x == null).length;
      if (un && !confirm('還有 ' + un + ' 題未作答，未作答一律視為答錯並收進錯題本。確定交卷？')) return;
      examSubmit(false); render(); window.scrollTo({ top: 0 }); return;
    }
    if (a === 'flag') { EX.flag[EX.i] = !EX.flag[EX.i]; saveEX(); render(); return; }
    if (a === 'clear') { EX.ans[EX.i] = null; saveEX(); render(); return; }
    if (a === 'prev') { EX.i = Math.max(0, EX.i - 1); saveEX(); render(); return; }
    if (a === 'next') { EX.i = (EX.i + 1) % EX.n; saveEX(); render(); return; }
    return;
  }

  /* ---- 試算 ---- */
  if (t.dataset.calctab) { CALC.tab = t.dataset.calctab; render(); return; }
  if (t.dataset.calckind) { CALC.kind = t.dataset.calckind; render(); return; }
  if (t.dataset.calcamt) { CALC.amt = +t.dataset.calcamt; render(); return; }
  if (t.dataset.calcacc) { CALC.acc = t.dataset.calcacc; render(); return; }
  if (t.dataset.calctg) { CALC[t.dataset.calctg] = !CALC[t.dataset.calctg]; render(); return; }

  /* ---- 學習紀錄備份 ---- */
  if (t.id === 'btnExport') { exportProgress(); return; }
  if (t.id === 'btnImport') { const f = $('#fileImport'); if (f) f.click(); return; }
  if (t.dataset.qs) { QZ.scope = t.dataset.qs; buildPool(); render(); return; }
  if (t.dataset.qm) { QZ.mode = t.dataset.qm; buildPool(); render(); return; }
  if (t.dataset.pick != null && t.hasAttribute('data-pick')) {
    if (QZ.picked != null) return;
    QZ.picked = +t.dataset.pick;
    const q = QZ.pool[QZ.i % QZ.pool.length];
    const ok = QZ.picked === q.a;
    if (ok) QZ.right++; else QZ.wrong++;
    if (q._k != null) srsRecord(q._k, ok);
    if (!ok && q.r && !marks.has(q.r)) { marks.add(q.r); saveMarks(); }   // 答錯的條文自動進「我的重點」
    render(); return;
  }
  if (t.dataset.qa) {
    const act = t.dataset.qa;
    if (act === 'clearstat') {
      if (confirm('確定清除全部練習紀錄（含錯題本與複習排程）？')) { QS = {}; saveQS(); buildPool(); render(); }
      return;
    }
    if (act === 'reset') { buildPool(); }
    else if (act === 'show') QZ.shown = true;
    else if (act === 'next') { QZ.i++; QZ.picked = null; QZ.shown = false; }
    else if (act === 'skip') { QZ.i++; QZ.picked = null; QZ.shown = false; }
    else if (act === 'right' || act === 'wrong') {
      const ok = act === 'right';
      const r = QZ.pool[QZ.i % QZ.pool.length];
      if (r && r.lid) fcRecord(fcKey(r, QZ.mode), ok);      // 翻牌卡也進間隔複習
      if (ok) QZ.right++; else { QZ.wrong++; if (r && r.lid && !marks.has(r.lid + '#' + r.no)) { marks.add(r.lid + '#' + r.no); saveMarks(); } }
      QZ.i++; QZ.shown = false;
    }
    else if (act === 'fdue') { QZ.fdue = !QZ.fdue; buildPool(); }
    else if (act === 'focus') { QZ.mode = 'focus'; QZ.focusR = t.dataset.r; buildPool(); }
    else if (act === 'goto') { const r = QZ.pool[QZ.i % QZ.pool.length]; goto(r.lid + '#' + r.no); return; }
    render(); return;
  }
});

let ltTmr = null;
document.addEventListener('input', e => {
  if (e.target.id !== 'ltq') return;
  clearTimeout(ltTmr);
  const v = e.target.value;
  ltTmr = setTimeout(() => {
    LT.q = v.trim(); LT.limit = 60;
    render();
    const el = $('#ltq');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, 160);
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
  else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault(); $('#q').focus();
  }
});

/* ================== 啟動 ================== */
const savedTheme = LS.get('theme', null);
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', 'dark');

buildNav();
if (location.hash && location.hash.length > 2) applyHash(location.hash);
curHash = location.hash;
render();
if (S.view === 'law' && S.anchor) flashArt(S.lid, S.anchor);

/* 模擬考倒數（只在考試中才真的做事） */
setInterval(examTick, 1000);

/* 首屏畫完後才把 3,661 則函釋索引接進來 */
const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1200));
idle(() => ensureLetters());

/* 離線可用：加到主畫面後通勤也能複習 */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
})();
