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
const REFRE = /(本法|政府採購法|採購法|本細則|本辦法|本準則|本規則|本標準|本要點)?第\s*([一二三四五六七八九十百零〇\d]+)\s*條(?:\s*之\s*([一二三四五六七八九十\d]+))?/g;
const REV = {};        // 'A0030057#50' -> [{lid,no,label,lt}]
function refTarget(prefix, selfLid) {
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

const S = { view: 'home', lid: null, cat: null, q: '', scope: 'all', open: {} };

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
    return `<span class="xref" data-go="${tl}#${n}">${full}</span>`;
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
    rel.slice(0, 14).map(r => `<button class="relchip" data-go="${r.lid}#${r.no}">${esc(r.ls)} ${esc(r.label)}</button>`).join('') +
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
    <div class="artbody">${body}</div>${relHTML}</article>`;
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
      <button class="navcat" data-view="dg"><span class="ci">圖</span><span class="cn">圖解流程</span></button>
      <button class="navcat" data-view="memo"><span class="ci">記</span><span class="cn">重點速記卡</span></button>
      <button class="navcat" data-view="cmp2"><span class="ci">比</span><span class="cn">易混淆概念比較</span></button>
      <button class="navcat" data-view="cmp"><span class="ci">⇄</span><span class="cn">母法／細則對照表</span></button>
      <button class="navcat" data-view="quiz"><span class="ci">?</span><span class="cn">自我測驗（選擇題）</span></button>
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
}

/* ================== 各視圖 ================== */
function viewHome() {
  const stats = D.cats.map(c => ({ c, n: IDX.filter(r => r.cats.indexOf(c.id) >= 0).length }));
  return `<div class="crumb">首頁</div>
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

    <div class="card"><h3><span class="dot"></span>五個記憶工具</h3>
      <p class="hint">為「熟記 ＋ 比較」設計的五個檢視。先看圖建立骨架，再用表格與題目補細節。</p>
      <table class="t"><tbody>
        <tr><td class="k"><button class="ref" data-view="dg">圖解流程</button></td>
            <td>${D.diagrams.length} 張手繪流程圖：金額級距、招標決策樹、等標期、比減價格、驗收時程、爭議雙軌、停權流程、組織關係、GPA 判斷。瀏覽各分類時也會出現在最上方。</td></tr>
        <tr><td class="k"><button class="ref" data-view="memo">重點速記卡</button></td>
            <td>${D.memo.length} 張高頻考點整併表：金額級距、招標方式、§22 十六款、等標期、比減價、保證金、驗收期限、停權、罰則、GPA。每格都可點回原條文。</td></tr>
        <tr><td class="k"><button class="ref" data-view="cmp2">易混淆概念比較</button></td>
            <td>${D.compare.length} 組並排比較表：異議/申訴/調解/仲裁、轉包/分包、四種保證金、廢標/不予開標/不決標、初驗/驗收/減價收受、五個小組等。</td></tr>
        <tr><td class="k"><button class="ref" data-view="cmp">母法／細則對照表</button></td>
            <td>依程式自動解析「本法第○條」引用關係，列出母法每一條對應的施行細則與子法條文。</td></tr>
        <tr><td class="k"><button class="ref" data-view="quiz">自我測驗</button></td>
            <td><b>${D.quiz.length} 題選擇題</b>（附詳解與條文連結）＋ 條號翻牌卡；可限定分類或只考已標記的重點。</td></tr>
      </tbody></table>
      <div class="mnemo"><div class="lb">標記重點</div>
        <p>任一條文右上角 <b>☆</b> 可標記；標記後左側出現金色標線，並可用搜尋範圍「★ 我的重點」只搜自己標的條文，測驗也能只考標記過的。</p></div>
    </div>

    <div class="card"><h3><span class="dot"></span>條文互相連結</h3>
      <p class="hint">條文中出現的「本法第○條」「第○條」皆為<span class="xref">可點連結</span>，直接跳到該條。</p>
      <p class="hint">每條下方的「相關條文」列出<b>反向引用</b>——也就是有哪些細則、子法條文引用了這一條，這是把母法與子法串起來記憶的關鍵。</p>
      <p class="hint" style="margin-top:12px"><b>收錄範圍</b>：政府採購法、施行細則、41 部授權子法，
        以及工程會訂頒之 <b>27 部作業規定／要點／須知</b>（行政規則），依採購流程分入八大分類，
        法規名稱旁以「工程會訂頒」標示。</p>
      <div class="note">${esc(D.meta.note)}</div>
    </div>
  </div>`;
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
  return `<div class="rescount">在<b> ${scopeName} </b>中找到 <b>${res.length}</b> 條符合「${esc(q)}」，分佈於 ${groups.length} 部法規</div>` +
    groups.map(g => `<div class="resgrp"><h4>${esc(g.lt)}<span class="n">${g.items.length}</span></h4>` +
      g.items.slice(0, 40).map(r => `<button class="res" data-go="${r.rec.lid}#${r.rec.no}">
        <span class="rno">${esc(r.rec.label)}</span><span class="rch">${esc(r.rec.ch || '')}</span>
        <div class="rtx">${hl(snippet(r.rec.text, terms), terms)}</div></button>`).join('') +
      (g.items.length > 40 ? `<div style="font-size:11.5px;color:var(--ink3);padding:4px 2px">…另有 ${g.items.length - 40} 條，請再加關鍵字縮小範圍</div>` : '') +
      `</div>`).join('');
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
    if (!rel.length) return;
    rows += `<tr>
      <td class="k"><button class="ref" style="font-weight:800;font-size:12.5px" data-go="A0030057#${a.no}">${esc(a.label)}</button>
        <div style="font-size:10.5px;color:var(--ink3);font-weight:400;max-width:190px;line-height:1.5">${esc(a.lines[0].slice(0, 34))}…</div></td>
      <td>${det.length ? det.map(r => `<button class="relchip" data-go="${r.lid}#${r.no}">${esc(r.label)}</button>`).join(' ') : '<span style="color:var(--ink3)">—</span>'}</td>
      <td>${sub.length ? sub.map(r => `<button class="relchip" data-go="${r.lid}#${r.no}">${esc(r.ls)}${esc(r.label)}</button>`).join(' ') : '<span style="color:var(--ink3)">—</span>'}</td>
    </tr>`;
  });
  const noRef = main.articles.filter(a => !(REV['A0030057#' + a.no] || []).length);
  return `<div class="crumb">工具</div>
  <div class="lawhead"><h2>母法／施行細則／子法 對照表</h2>
    <div class="lawmeta"><span>由程式自動解析各法規條文中「本法第○條」之引用關係產生</span></div></div>
  <div class="note" style="margin:0 0 16px">此表呈現的是<b>反向引用</b>：左欄為政府採購法條文，右側兩欄列出「明文引用該條」的施行細則與子法條文。
    未明文引用者不會出現在此表，但仍可能相關；請併用左側分類瀏覽與全文搜尋。</div>
  <div class="card"><div class="tablewrap"><table class="t">
    <thead><tr><th style="width:210px">政府採購法</th><th style="width:34%">施行細則</th><th>其他子法</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>
  <div class="card" style="margin-top:14px"><h3><span class="dot"></span>未被明文引用之母法條文（${noRef.length} 條）</h3>
    <p class="hint">這些條文在子法中未以「本法第○條」形式引用，多為直接適用之實體規定。</p>
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
  const cards = D.memo.map(card => `<div class="card${card.wide ? ' wide' : ''}">
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

/* ---------- 自我測驗（選擇題 + 條號翻牌） ---------- */
let QZ = { mode: 'mcq', scope: 'all', pool: [], i: 0, shown: false, picked: null, right: 0, wrong: 0 };

function quizScopes() {
  return [['all', '全部'], ['main', '只考採購法'], ['md', '採購法＋細則'], ['mark', '★我的重點']]
    .concat(D.cats.map(c => ['c:' + c.id, c.name]));
}
function buildPool() {
  QZ.i = 0; QZ.shown = false; QZ.picked = null; QZ.right = 0; QZ.wrong = 0;
  let p;
  if (QZ.mode === 'mcq') {
    p = D.quiz.slice();
    if (QZ.scope === 'main' || QZ.scope === 'md') p = p.filter(x => x.r.indexOf('A003005') === 0);
    else if (QZ.scope === 'mark') p = p.filter(x => marks.has(x.r));
    else if (QZ.scope.indexOf('c:') === 0) p = p.filter(x => x.c === QZ.scope.slice(2));
  } else {
    p = IDX.filter(r => r.text.length > 25);
    if (QZ.scope === 'main') p = p.filter(r => r.lid === 'A0030057');
    else if (QZ.scope === 'md') p = p.filter(r => r.lid === 'A0030057' || r.lid === 'A0030058');
    else if (QZ.scope === 'mark') p = p.filter(r => marks.has(r.lid + '#' + r.no));
    else if (QZ.scope.indexOf('c:') === 0) p = p.filter(r => r.cats.indexOf(QZ.scope.slice(2)) >= 0);
  }
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  QZ.pool = p;
}
function viewQuiz() {
  if (!QZ.pool.length) buildPool();
  const head = `<div class="crumb">工具</div>
   <div class="lawhead"><h2>自我測驗</h2>
     <div class="lawmeta"><span>${D.quiz.length} 題選擇題（自製練習題，非官方考古題）　·　${IDX.length} 條條號翻牌卡</span></div></div>
   <div class="scoperow" style="margin:0 0 14px">
     <span class="lbl">題型</span>
     <button class="chip${QZ.mode === 'mcq' ? ' on' : ''}" data-qm="mcq">選擇題</button>
     <button class="chip${QZ.mode === 'no' ? ' on' : ''}" data-qm="no">看條文猜條號</button>
     <button class="chip${QZ.mode === 'tx' ? ' on' : ''}" data-qm="tx">看條號背條文</button>
     <span style="flex:1"></span>
     <button class="chip" data-qa="reset">↺ 重新開始</button>
   </div>
   <div class="scoperow" style="margin:0 0 18px">
     <span class="lbl">範圍</span>
     ${quizScopes().map(([v, n]) => `<button class="chip${QZ.scope === v ? ' on' : ''}" data-qs="${v}">${n}</button>`).join('')}
   </div>`;
  if (!QZ.pool.length) return head + `<div class="empty"><div class="big">?</div><h3>此範圍沒有題目</h3>
    <p>換一個範圍，或先在條文上點 <code>☆</code> 標記重點。</p></div>`;

  const n = QZ.pool.length, cur = QZ.i % n;
  const done = QZ.right + QZ.wrong;
  const stat = `<div class="bar"><i style="width:${Math.round((cur / n) * 100)}%"></i></div>
    <div class="score"><span>第 <b>${cur + 1}</b> / ${n} 題</span>
      <span class="ok">✓ <b>${QZ.right}</b></span><span class="ng">✗ <b>${QZ.wrong}</b></span>
      ${done ? `<span>正確率 <b>${Math.round(QZ.right / done * 100)}%</b></span>` : ''}</div>`;

  if (QZ.mode === 'mcq') {
    const q = QZ.pool[cur];
    const cat = D.cats.find(c => c.id === q.c);
    const L = ['A', 'B', 'C', 'D'];
    const opts = q.o.map((o, i) => {
      let cls = '';
      if (QZ.picked != null) {
        if (i === q.a) cls = ' right';
        else if (i === QZ.picked) cls = ' wrong';
      }
      return `<button class="opt${cls}" data-pick="${i}" ${QZ.picked != null ? 'disabled' : ''}>
        <span class="lt">${L[i]}</span><span>${esc(o)}</span></button>`;
    }).join('');
    const lid = q.r.split('#')[0], ano = q.r.split('#')[1];
    const lawOf = LAWBY[lid];
    const artLabel = lawOf && lawOf.artBy[ano] ? lawOf.artBy[ano].label : '';
    return head + `<div class="fcwrap" style="max-width:720px"><div class="mcq">
      <div class="qn">${cat ? esc(cat.code + ' ' + cat.name) : ''}　·　第 ${cur + 1} 題</div>
      <div class="qt">${esc(q.q)}</div>
      <div class="opts">${opts}</div>
      ${QZ.picked != null ? `<div class="expl"><div class="lb">${QZ.picked === q.a ? '答對了' : '正解為 ' + L[q.a]}</div>
        <div>${q.e.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</div>
        ${lawOf ? `<div style="margin-top:9px"><button class="relchip" data-go="${q.r}">前往 ${esc(lawOf.short || lawOf.title)} ${esc(artLabel)} →</button></div>` : ''}
      </div>` : ''}
      </div>
      <div class="fcbar">${QZ.picked != null
        ? `<button class="tbtn on" data-qa="next">下一題 →</button>`
        : `<button class="tbtn" data-qa="skip">跳過 ↷</button>`}</div>
      ${stat}</div>`;
  }

  const r = QZ.pool[cur];
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
  return head + `<div class="fcwrap"><div class="fc">${bodyHTML}</div>
    <div class="fcbar">
      ${QZ.shown ? `<button class="tbtn" data-qa="right">✓ 答對了</button>
                    <button class="tbtn" data-qa="wrong">✗ 沒記住</button>
                    <button class="tbtn" data-qa="goto">前往原文 →</button>`
                 : `<button class="tbtn on" data-qa="show">翻牌看答案</button>
                    <button class="tbtn" data-qa="skip">跳過 ↷</button>`}
    </div>${stat}</div>`;
}

/* ---------- 圖解流程 ---------- */
let DG = { id: null };
function dgFigure(d) {
  return `<figure class="dg">
    <div class="hint-scroll">← 左右滑動可看完整流程圖 →</div>
    <div class="svgwrap">${d.svg}</div>
    <figcaption>${esc(d.cap)}</figcaption></figure>`;
}
function dgCard(d, withTitle) {
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

/* ================== 路由 / 渲染 ================== */
function render() {
  const v = $('#view');
  let html;
  if (S.q) { S.view = 'search'; html = viewSearch(S.q); }
  else if (S.view === 'law') html = viewLaw(S.lid, S.cat);
  else if (S.view === 'cat') html = viewCat(S.cat);
  else if (S.view === 'memo') html = viewMemo();
  else if (S.view === 'cmp') html = viewCmp();
  else if (S.view === 'cmp2') html = viewCompare();
  else if (S.view === 'dg') html = viewDiagrams();
  else if (S.view === 'quiz') html = viewQuiz();
  else if (S.view === 'marks') html = viewMarks();
  else html = viewHome();
  v.innerHTML = html;
  syncNav();
  updateScopeChips();
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
  S.lid = lid; S.cat = a ? a.cat : l.articles[0].cat; S.view = 'law';
  render();
  requestAnimationFrame(() => {
    const el = document.getElementById('a-' + lid + '-' + no);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 2200);
    } else window.scrollTo({ top: 0 });
  });
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
  const t = e.target.closest('[data-go],[data-cat],[data-law],[data-view],[data-home],[data-mark],[data-copy],[data-qa],[data-qs],[data-qm],[data-pick],[data-cmp],[data-dg],#clearMarks');
  if (!t) return;
  if (t.dataset.go) { goto(t.dataset.go); return; }
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
  if (t.dataset.view) { S.q = ''; $('#q').value = ''; S.view = t.dataset.view; render(); window.scrollTo({ top: 0 }); closeSide(); return; }
  if (t.dataset.cmp) { CMP.id = t.dataset.cmp; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.dataset.dg) { DG.id = t.dataset.dg; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (t.dataset.qs) { QZ.scope = t.dataset.qs; buildPool(); render(); return; }
  if (t.dataset.qm) { QZ.mode = t.dataset.qm; buildPool(); render(); return; }
  if (t.dataset.pick != null && t.hasAttribute('data-pick')) {
    if (QZ.picked != null) return;
    QZ.picked = +t.dataset.pick;
    const q = QZ.pool[QZ.i % QZ.pool.length];
    if (QZ.picked === q.a) QZ.right++; else QZ.wrong++;
    render(); return;
  }
  if (t.dataset.qa) {
    const act = t.dataset.qa;
    if (act === 'reset') { buildPool(); }
    else if (act === 'show') QZ.shown = true;
    else if (act === 'next') { QZ.i++; QZ.picked = null; QZ.shown = false; }
    else if (act === 'skip') { QZ.i++; QZ.picked = null; QZ.shown = false; }
    else if (act === 'right') { QZ.right++; QZ.i++; QZ.shown = false; }
    else if (act === 'wrong') { QZ.wrong++; QZ.i++; QZ.shown = false; }
    else if (act === 'goto') { const r = QZ.pool[QZ.i % QZ.pool.length]; goto(r.lid + '#' + r.no); return; }
    render(); return;
  }
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
render();
})();
