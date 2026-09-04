# -*- coding: utf-8 -*-
"""流程圖解（手繪 inline SVG，隨主題自動變色）

配色規則：
  結構線／文字 = currentColor（跟隨主題前景色）
  重點／決策點 = var(--accent)
  次要說明     = currentColor + opacity
"""

# ---------------- SVG 小工具 ----------------
def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))

def txt(x, y, s, anchor='middle', fs=11.5, op=1.0, bold=False, color=None, cls=''):
    f = f' fill="{color}"' if color else ' fill="currentColor"'
    o = f' opacity="{op}"' if op != 1.0 else ''
    w = ' font-weight="700"' if bold else ''
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{fs}"{f}{o}{w}'
            f'{" class=" + chr(34) + cls + chr(34) if cls else ""}>{esc(s)}</text>')

def box(x, y, w, h, lines, accent=False, fs=11.5, lead=15, fill='var(--panel)',
        dash=False, op=1.0, bold_first=False, radius=7):
    st = 'var(--accent)' if accent else 'currentColor'
    sw = 1.8 if accent else 1
    so = '' if accent else ' stroke-opacity=".3"'
    d = ' stroke-dasharray="5 4"' if dash else ''
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" '
           f'stroke="{st}" stroke-width="{sw}"{so}{d} opacity="{op}"/>']
    n = len(lines)
    y0 = y + h / 2 - (n - 1) * lead / 2 + fs * 0.36
    for i, ln in enumerate(lines):
        b = bold_first and i == 0
        c = 'var(--accent)' if (accent and i == 0) else None
        out.append(txt(x + w / 2, y0 + i * lead, ln, fs=fs if not b else fs + 0.5,
                       bold=b, color=c, op=1.0 if i == 0 else .72))
    return ''.join(out)

def diamond(cx, cy, w, h, lines, fs=11.5, lead=14):
    """決策節點：以圓角矩形＋強調框表示（菱形放中文字太擠）"""
    x, y = cx - w / 2, cy - h / 2
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" fill="var(--panel)" '
           f'stroke="var(--accent)" stroke-width="1.8"/>']
    n = len(lines)
    y0 = cy - (n - 1) * lead / 2 + fs * 0.36
    for i, ln in enumerate(lines):
        out.append(txt(cx, y0 + i * lead, ln, fs=fs, bold=(i == 0), color='var(--accent)' if i == 0 else None))
    return ''.join(out)

def line(x1, y1, x2, y2, arrow=None, dash=False, op=.45):
    d = ' stroke-dasharray="5 4"' if dash else ''
    a = f' marker-end="url(#{arrow})"' if arrow else ''
    return (f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="currentColor" '
            f'stroke-width="1.4" stroke-opacity="{op}"{d}{a}/>')

def poly(pts, arrow=None, dash=False, op=.45):
    d = ' stroke-dasharray="5 4"' if dash else ''
    a = f' marker-end="url(#{arrow})"' if arrow else ''
    p = ' '.join(f'{x},{y}' for x, y in pts)
    return (f'<polyline points="{p}" fill="none" stroke="currentColor" stroke-width="1.4" '
            f'stroke-opacity="{op}"{d}{a}/>')

def strw(s, fs):
    """估算字串寬度：全形字約 1.0 em，半形約 0.55 em"""
    w = 0.0
    for ch in s:
        w += fs * (1.0 if ord(ch) > 0x2E7F else 0.55)
    return w

def tag(x, y, s, fs=10.5):
    """箭頭上的小標籤（帶底色避免壓線）"""
    w = strw(s, fs) + 12
    return (f'<rect x="{x - w/2}" y="{y - fs*0.82}" width="{w}" height="{fs*1.6}" rx="4" '
            f'fill="var(--bg)"/>' + txt(x, y + fs * 0.36, s, fs=fs, op=.8))

def defs(uid):
    return (f'<defs><marker id="{uid}" viewBox="0 0 10 10" refX="9" refY="5" '
            f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,1 L9,5 L0,9 z" fill="currentColor" fill-opacity=".55"/></marker></defs>')

def svg(uid, w, h, body, aria):
    # min-width 讓窄螢幕改為水平捲動，而不是把字縮到看不清
    mw = int(w * 0.8)
    return (f'<svg viewBox="0 0 {w} {h}" role="img" aria-label="{esc(aria)}" '
            f'style="width:100%;height:auto;max-width:{w}px;min-width:{mw}px;'
            f'font-family:var(--sans);color:var(--ink);display:block;margin:0 auto">'
            + defs(uid) + body + '</svg>')


D = []   # 圖解清單

# ============================================================ 1. 金額級距
def _money():
    uid = 'ar-money'; W, H = 880, 330
    LX = 250                      # 標籤欄右界
    X0, X1 = 262, 862             # 尺規範圍
    T = {'small': 340, 'pub': 432, 'chk': 566, 'huge': 706}
    b = [ ]
    # 門檻線
    for k, x in T.items():
        b.append(f'<line x1="{x}" y1="46" x2="{x}" y2="300" stroke="var(--accent)" '
                 f'stroke-width="1.2" stroke-opacity=".4" stroke-dasharray="4 4"/>')
    b.append(txt(T['small'], 20, '15 萬', fs=11.5, bold=True, color='var(--accent)'))
    b.append(txt(T['small'], 34, '公告金額 1/10', fs=9.5, op=.6))
    b.append(txt(T['pub'], 20, '150 萬', fs=11.5, bold=True, color='var(--accent)'))
    b.append(txt(T['pub'], 34, '公告金額', fs=9.5, op=.6))
    b.append(txt(T['chk'], 20, '5,000 萬（勞務 1,000 萬）', fs=10.5, bold=True, color='var(--accent)'))
    b.append(txt(T['chk'], 34, '查核金額', fs=9.5, op=.6))
    b.append(txt(T['huge'], 20, '2 億／1 億／2,000 萬', fs=10.5, bold=True, color='var(--accent)'))
    b.append(txt(T['huge'], 34, '巨額採購', fs=9.5, op=.6))
    # 級距名稱
    for cx, name in [(301, '小額'), (386, '未達公告'), (499, '公告以上'), (636, '查核以上'), (784, '巨額')]:
        b.append(txt(cx, 60, name, fs=10, op=.5))
    b.append(line(X0, 70, X1, 70, op=.18))
    rows = [
        ('得不經公告，逕洽廠商採購', X0, T['small'], '招標辦法 §5'),
        ('公開取得 3 家以上書面報價', T['small'], T['pub'], '採購法 §49'),
        ('應公開招標（除 §20、§22 外）', T['pub'], X1, '採購法 §19'),
        ('主（會）計及有關單位會同監辦', T['pub'], X1, '採購法 §13'),
        ('得向申訴會提起申訴', T['pub'], X1, '採購法 §76'),
        ('上級機關派員監辦', T['chk'], X1, '採購法 §12'),
        ('逐年提報使用情形及效益分析', T['huge'], X1, '採購法 §111'),
    ]
    y = 84
    for label, x1, x2, ref in rows:
        b.append(txt(LX - 4, y + 15, label, anchor='end', fs=11.5))
        b.append(txt(LX - 4, y + 27, ref, anchor='end', fs=9, op=.5))
        b.append(f'<rect x="{x1}" y="{y + 3}" width="{x2 - x1}" height="18" rx="9" '
                 f'fill="var(--accent)" fill-opacity=".16" stroke="var(--accent)" stroke-opacity=".5"/>')
        b.append(f'<circle cx="{x1 + 9}" cy="{y + 12}" r="3.5" fill="var(--accent)"/>')
        y += 31
    return dict(id='money', cat='g', t='金額級距：跨過哪條線，就多一項義務',
                cap='四個門檻把採購切成五段。每一條橫槓從義務「開始適用」的那一點畫起，'
                    '往右延伸——愈高金額，累積的程序義務愈多。',
                aria='金額級距圖：以 15 萬、150 萬、查核金額、巨額四個門檻，標示各項採購義務從哪一級距開始適用',
                svg=svg(uid, W, H, ''.join(b), '金額級距與義務對照圖'))
D.append(_money())

# ============================================================ 2. 招標方式決策樹
def _bidmode():
    uid = 'ar-bid'; W, H = 880, 396
    b = []
    b.append(box(370, 12, 140, 30, ['辦理採購']))
    b.append(line(440, 42, 440, 58, arrow=uid))
    b.append(diamond(440, 78, 300, 34, ['採購金額 ≧ 公告金額 150 萬？']))
    b.append(poly([(440, 95), (440, 116), (205, 116), (205, 134)], arrow=uid))
    b.append(poly([(440, 95), (440, 116), (650, 116), (650, 134)], arrow=uid))
    b.append(tag(300, 112, '否'))
    b.append(tag(560, 112, '是'))
    # 左：未達公告金額
    b.append(box(95, 134, 220, 28, ['未達公告金額']))
    b.append(line(205, 162, 205, 176, arrow=uid))
    b.append(diamond(205, 194, 300, 32, ['採購金額 > 15 萬？'], fs=11))
    b.append(poly([(205, 210), (205, 228), (110, 228), (110, 244)], arrow=uid))
    b.append(poly([(205, 210), (205, 228), (302, 228), (302, 244)], arrow=uid))
    b.append(tag(150, 226, '是'))
    b.append(tag(258, 226, '否'))
    b.append(box(18, 244, 184, 34, ['① §22Ⅰ①～⑮', '→ 限制性招標'], fs=10.5, lead=15))
    b.append(box(18, 284, 184, 40, ['② §22Ⅰ⑯ 簽報首長核准', '得採限制性，免報主管機關認定'], fs=10, lead=13))
    b.append(box(18, 330, 184, 44, ['③ §49 公開取得 3 家以上', '書面報價或企劃書，', '擇符合需要者比價或議價'], fs=10, lead=12.5))
    b.append(box(214, 244, 176, 62, ['小額採購', '得不經公告程序，', '逕洽廠商採購，', '免提供報價或企劃書'], fs=10, lead=13, accent=True))
    # 右：公告金額以上 → 三種方式
    b.append(box(540, 134, 220, 28, ['公告金額以上']))
    b.append(poly([(650, 162), (650, 180), (487, 180), (487, 196)], arrow=uid))
    b.append(line(650, 162, 650, 196, arrow=uid))
    b.append(poly([(650, 162), (650, 180), (800, 180), (800, 196)], arrow=uid))
    b.append(box(410, 196, 154, 30, ['公開招標 §19'], accent=True, fs=12))
    b.append(box(573, 196, 154, 30, ['選擇性招標 §20'], fs=12))
    b.append(box(723, 196, 154, 30, ['限制性招標 §22'], fs=12))
    b.append(box(410, 234, 154, 74, ['公告邀請', '不特定廠商投標', '', '公告金額以上之原則'], fs=10, lead=14))
    b.append(box(573, 234, 154, 74, ['公告 → 先審資格', '→ 邀合格廠商投標', '五款：經常性採購／審查', '費時／高額費用／資格', '複雜／研究發展'], fs=9.5, lead=12.5))
    b.append(box(723, 234, 154, 74, ['不公告；2 家以上比價', '或 1 家議價', '十六款情形之一', '（⑬⑭不適用工程採購）'], fs=9.5, lead=13))
    b.append(box(573, 316, 304, 32, ['經常性採購應建立 6 家以上合格廠商名單（§21Ⅲ）'], fs=10.5, dash=True, fill='none'))
    return dict(id='bidmode', cat='b', t='招標方式怎麼選：從金額往下走',
                cap='第一個岔路是「有沒有達到公告金額」，第二個岔路才是招標方式。'
                    '未達公告金額時，真正的分水嶺是公告金額的十分之一（15 萬）。',
                aria='招標方式決策樹：先判斷是否達公告金額 150 萬，未達者再依是否逾 15 萬分流；達公告金額者分為公開招標、選擇性招標、限制性招標',
                svg=svg(uid, W, H, ''.join(b), '招標方式決策樹'))
D.append(_bidmode())

# ============================================================ 3. 等標期
def _period():
    uid = 'ar-per'; W, H = 800, 290
    X0 = 250; PPD = 17.0   # px per day
    b = []
    # 軸
    for d_ in (0, 7, 14, 21, 28):
        x = X0 + d_ * PPD
        b.append(f'<line x1="{x}" y1="52" x2="{x}" y2="248" stroke="currentColor" '
                 f'stroke-width="1" stroke-opacity=".16" stroke-dasharray="3 4"/>')
        b.append(txt(x, 44, f'{d_} 日', fs=10, op=.55))
    rows = [
        (['未達公告金額'], 7, 7),
        (['公告金額以上', '未達查核金額'], 14, 10),
        (['查核金額以上', '未達巨額'], 21, 10),
        (['巨額採購'], 28, 14),
    ]
    y = 62
    for labels, open_d, sel_d in rows:
        ly = y + 25 - (len(labels) - 1) * 8
        for i, l in enumerate(labels):
            b.append(txt(X0 - 16, ly + i * 16, l, anchor='end', fs=11.5))
        b.append(f'<rect x="{X0}" y="{y + 4}" width="{open_d * PPD}" height="17" rx="4" '
                 f'fill="var(--accent)" fill-opacity=".72"/>')
        b.append(txt(X0 + open_d * PPD + 16, y + 17, f'{open_d} 日', fs=11, bold=True, color='var(--accent)'))
        b.append(f'<rect x="{X0}" y="{y + 27}" width="{sel_d * PPD}" height="17" rx="4" '
                 f'fill="currentColor" fill-opacity=".26"/>')
        b.append(txt(X0 + sel_d * PPD + 16, y + 40, f'{sel_d} 日', fs=11, op=.7))
        y += 50
    # 圖例
    b.append(f'<rect x="{X0}" y="266" width="14" height="12" rx="3" fill="var(--accent)" fill-opacity=".72"/>')
    b.append(txt(X0 + 20, 276, '公開招標（期限標準 §2）', anchor='start', fs=10.5))
    b.append(f'<rect x="{X0 + 200}" y="266" width="14" height="12" rx="3" fill="currentColor" fill-opacity=".26"/>')
    b.append(txt(X0 + 220, 276, '選擇性招標資格審查（§3）', anchor='start', fs=10.5))
    b.append(txt(14, 24, '等標期下限', anchor='start', fs=12.5, bold=True))
    b.append(txt(14, 40, '自刊登政府採購公報日起算', anchor='start', fs=10, op=.6))
    b.append(txt(X0, 276, '', anchor='start'))
    return dict(id='period', cat='b', t='等標期：公開招標與選擇性招標的落差',
                cap='公開招標是 7→14→21→28 的等差；選擇性招標的資格審查只分三級（7→10→14），'
                    '界線落在巨額而非查核金額——這是兩者最容易記混的地方。',
                aria='等標期長條圖：公開招標依金額級距為 7、14、21、28 日；選擇性招標資格審查為 7、10、10、14 日',
                svg=svg(uid, W, H, ''.join(b), '等標期比較圖'))
D.append(_period())

# ============================================================ 4. 比減價格
def _award():
    uid = 'ar-awd'; W, H = 660, 484
    b = []
    CX = 250
    b.append(box(CX - 130, 10, 260, 30, ['最低標價超過底價 §53Ⅰ'], accent=True))
    b.append(line(CX, 40, CX, 58, arrow=uid))
    b.append(box(CX - 130, 58, 260, 30, ['洽該最低標廠商減價 1 次']))
    b.append(line(CX, 88, CX, 106, arrow=uid))
    b.append(diamond(CX, 124, 220, 32, ['仍超過底價？']))
    b.append(poly([(CX + 110, 124), (CX + 175, 124)], arrow=uid))
    b.append(tag(CX + 143, 116, '否'))
    b.append(box(CX + 178, 108, 96, 32, ['決標'], accent=True, fs=12))
    b.append(line(CX, 140, CX, 162, arrow=uid))
    b.append(tag(CX, 152, '是'))
    b.append(box(CX - 150, 162, 300, 44, ['所有合於招標文件之廠商', '重新比減價格，不得逾 3 次'], lead=15))
    b.append(line(CX, 206, CX, 224, arrow=uid))
    b.append(diamond(CX, 242, 220, 32, ['仍超過底價？']))
    b.append(poly([(CX + 110, 242), (CX + 175, 242)], arrow=uid))
    b.append(tag(CX + 143, 234, '否'))
    b.append(box(CX + 178, 226, 96, 32, ['決標'], accent=True, fs=12))
    b.append(line(CX, 258, CX, 280, arrow=uid))
    b.append(tag(CX, 270, '是'))
    b.append(diamond(CX, 306, 300, 44, ['不逾預算數額', '且機關確有緊急情事需決標？'], fs=11, lead=14))
    b.append(poly([(CX + 150, 306), (CX + 200, 306)], arrow=uid))
    b.append(tag(CX + 175, 298, '否'))
    b.append(box(CX + 203, 290, 96, 32, ['廢標'], fs=12))
    b.append(line(CX, 328, CX, 352, arrow=uid))
    b.append(tag(CX, 342, '是'))
    b.append(box(CX - 170, 352, 340, 52, ['經原底價核定人或授權人員核准決標', '決標價不得超過底價 8%'],
                 accent=True, lead=16, bold_first=False))
    b.append(line(CX, 404, CX, 424, arrow=uid, dash=True))
    b.append(box(CX - 200, 424, 400, 46, ['查核金額以上之採購，超過底價 4% 者，',
                                          '應「先」報經上級機關核准後決標'], dash=True, fs=11, lead=15))
    return dict(id='award', cat='d', t='最低標超過底價：減一次、比減三次、8% 與 4%',
                cap='兩個容易混淆的百分比在流程尾端才出現：8% 是決標價的絕對上限，'
                    '4% 是「查核金額以上必須先報上級機關」的門檻，不是另一個上限。',
                aria='決標比減價格流程圖：最低標超過底價後減價一次、比減不逾三次，仍超過底價時須不逾預算且有緊急情事方得核准決標，且不得超過底價百分之八；查核金額以上超過百分之四應先報上級機關',
                svg=svg(uid, W, H, ''.join(b), '超底價比減價格流程圖'))
D.append(_award())

# ============================================================ 5. 驗收與付款
def _accept():
    uid = 'ar-acc'; W, H = 880, 348
    b = []
    def node(cx, cy, w, lines, accent=False):
        return box(cx - w / 2, cy - 22, w, 44, lines, accent=accent, fs=10.5, lead=15)
    b.append(txt(14, 26, '有初驗程序', anchor='start', fs=12, bold=True, color='var(--accent)'))
    ys = 76
    pts = [(78, ['廠商書面', '通知竣工']), (232, ['機關會同', '核對竣工']),
           (386, ['監造單位', '送竣工資料']), (556, ['機關辦理', '初驗']), (726, ['機關辦理', '驗收'])]
    for i, (cx, lines) in enumerate(pts):
        b.append(node(cx, ys, 130, lines, accent=(i == 4)))
    gaps = [(155, '7 日', '細§92Ⅰ'), (309, '7 日', '細§92Ⅱ'), (471, '30 日', '細§92Ⅱ'), (641, '20 日', '細§93')]
    for i, (cx, d_, ref) in enumerate(gaps):
        x1 = pts[i][0] + 65; x2 = pts[i + 1][0] - 65
        b.append(line(x1, ys, x2, ys, arrow=uid, op=.5))
        b.append(f'<rect x="{cx - 26}" y="{ys - 26}" width="52" height="17" rx="8" fill="var(--accent)" fill-opacity=".14"/>')
        b.append(txt(cx, ys - 14, d_, fs=10.5, bold=True, color='var(--accent)'))
        b.append(txt(cx, ys + 24, ref, fs=9, op=.5))
    b.append(txt(14, 156, '無初驗程序', anchor='start', fs=12, bold=True))
    ys2 = 200
    b.append(node(386, ys2, 150, ['廠商通知備驗或', '可得驗收程序完成']))
    b.append(node(726, ys2, 130, ['機關辦理', '驗收'], accent=True))
    b.append(line(461, ys2, 661, ys2, arrow=uid, op=.5))
    b.append(f'<rect x="{535}" y="{ys2 - 26}" width="52" height="17" rx="8" fill="currentColor" fill-opacity=".1"/>')
    b.append(txt(561, ys2 - 14, '30 日', fs=10.5, bold=True))
    b.append(txt(561, ys2 + 24, '細§94', fs=9, op=.5))
    # 付款帶
    b.append(f'<line x1="14" y1="254" x2="866" y2="254" stroke="currentColor" stroke-width="1" stroke-opacity=".14"/>')
    b.append(txt(14, 280, '驗收合格後的付款', anchor='start', fs=12, bold=True))
    b.append(node(232, 306, 150, ['提出估驗或階段', '完成證明文件']))
    b.append(node(470, 306, 130, ['機關完成', '審核程序']))
    b.append(node(700, 306, 130, ['付款']))
    b.append(line(307, 306, 405, 306, arrow=uid, op=.5))
    b.append(txt(356, 296, '15 日', fs=10.5, bold=True, color='var(--accent)'))
    b.append(line(535, 306, 635, 306, arrow=uid, op=.5))
    b.append(txt(585, 296, '15 日', fs=10.5, bold=True, color='var(--accent)'))
    b.append(txt(585, 336, '申請核撥補助款者為 30 日', fs=9.5, op=.55))
    b.append(txt(866, 336, '§73-1　日數指實際工作日', anchor='end', fs=9.5, op=.55))
    return dict(id='accept', cat='p', t='驗收時程：七、七、三十，再看有沒有初驗',
                cap='上下兩軌的差別只在中段——有初驗程序者走「30 日初驗 → 20 日驗收」，'
                    '沒有初驗程序者直接「30 日驗收」。下方是驗收合格後的付款期限。',
                aria='驗收時程圖：有初驗程序為竣工通知七日、監造送件七日、初驗三十日、驗收二十日；無初驗程序為備驗後三十日驗收；付款為審核十五日、付款十五日，申請補助款三十日',
                svg=svg(uid, W, H, ''.join(b), '驗收與付款時程圖'))
D.append(_accept())

# ============================================================ 6. 爭議處理雙軌
def _dispute():
    uid = 'ar-dis'; W, H = 900, 360
    b = []
    def n(cx, cy, w, h, lines, accent=False, fs=10.5):
        return box(cx - w / 2, cy - h / 2, w, h, lines, accent=accent, fs=fs, lead=15)
    b.append(txt(14, 24, '軌道一　招標／審標／決標爭議', anchor='start', fs=12.5, bold=True, color='var(--accent)'))
    b.append(txt(14, 40, '§74 ～ §85', anchor='start', fs=9.5, op=.55))
    y = 92
    b.append(n(80, y, 128, 46, ['廠商提出', '異議']))
    b.append(n(268, y, 138, 46, ['招標機關', '處理異議']))
    b.append(n(462, y, 138, 46, ['向申訴會', '提起申訴']))
    b.append(n(660, y, 138, 46, ['申訴會', '完成審議']))
    b.append(n(838, y, 110, 46, ['審議判斷'], accent=True))
    arcs = [(144, 199, '10 日', '§75Ⅰ　招標文件為等標期 ¼、至少 10 日'),
            (337, 393, '15 日', '§75Ⅱ'),
            (531, 591, '15 日', '§76Ⅰ　限公告金額以上'),
            (729, 783, '40 日', '§78Ⅱ　必要時得延長 40 日')]
    for x1, x2, d_, note in arcs:
        cx = (x1 + x2) / 2
        b.append(line(x1, y, x2, y, arrow=uid, op=.5))
        b.append(f'<rect x="{cx - 25}" y="{y - 25}" width="50" height="17" rx="8" fill="var(--accent)" fill-opacity=".14"/>')
        b.append(txt(cx, y - 13, d_, fs=10.5, bold=True, color='var(--accent)'))
    b.append(txt(80, 132, '招標文件：等標期 ¼（至少 10 日）', fs=9.5, op=.55, anchor='start'))
    b.append(txt(462, 132, '限公告金額以上；追繳押標金不受限', fs=9.5, op=.55))
    b.append(txt(660, 132, '必要時得延長 40 日', fs=9.5, op=.55))
    b.append(line(838, 115, 838, 140, arrow=uid, op=.5))
    b.append(n(838, 164, 128, 40, ['視同訴願決定', '§83'], accent=True, fs=10))
    b.append(line(838, 184, 838, 202, arrow=uid, op=.5, dash=True))
    b.append(txt(838, 218, '→ 行政訴訟', fs=10.5, op=.7))
    # 分隔
    b.append(f'<line x1="14" y1="238" x2="886" y2="238" stroke="currentColor" stroke-width="1" stroke-opacity=".14"/>')
    b.append(txt(14, 262, '軌道二　履約爭議', anchor='start', fs=12.5, bold=True))
    b.append(txt(160, 262, '§85-1 ～ §85-4', anchor='start', fs=9.5, op=.55))
    y2 = 312
    b.append(n(84, y2, 136, 44, ['機關與廠商', '協議不成']))
    b.append(n(292, y2, 168, 44, ['向申訴會申請調解', '廠商申請，機關不得拒絕'], accent=True, fs=10))
    b.append(n(516, y2, 150, 44, ['調解不成立']))
    b.append(n(760, y2, 210, 44, ['工程及技術服務採購：提付仲裁，', '機關不得拒絕（強制仲裁）'], accent=True, fs=9.5))
    b.append(line(152, y2, 208, y2, arrow=uid, op=.5))
    b.append(line(376, y2, 441, y2, arrow=uid, op=.5))
    b.append(line(591, y2, 655, y2, arrow=uid, op=.5))
    b.append(txt(408, y2 - 12, '機關不同意', fs=9.5, op=.6))
    b.append(txt(408, y2 + 22, '調解建議／方案', fs=9.5, op=.6))
    return dict(id='dispute', cat='r', t='爭議兩條軌道：異議申訴 vs 調解仲裁',
                cap='上軌處理「招標、審標、決標」，終點是視同訴願決定、可續行行政訴訟；'
                    '下軌處理「履約」，終點是工程及技術服務採購的強制仲裁。兩軌不會交會。',
                aria='爭議處理雙軌流程圖：上軌為異議十日、機關處理十五日、申訴十五日、審議四十日，審議判斷視同訴願決定；下軌為協議不成後調解，工程及技術服務採購調解不成立者得提付仲裁機關不得拒絕',
                svg=svg(uid, W, H, ''.join(b), '爭議處理雙軌流程圖'))
D.append(_dispute())

# ============================================================ 7. 停權
def _debar():
    uid = 'ar-deb'; W, H = 880, 400
    b = []
    b.append(box(20, 14, 200, 56, ['§101Ⅰ 十五款事由', '借冒名／不實文件／轉包／', '延誤履約／行賄…'], accent=True, fs=10.5, lead=14))
    b.append(line(220, 42, 250, 42, arrow=uid))
    b.append(box(250, 8, 236, 68, ['機關通知前應：', '① 給予廠商陳述意見機會', '② 成立採購工作及審查小組認定'],
                 fs=10.5, lead=15, bold_first=True))
    b.append(line(486, 42, 516, 42, arrow=uid))
    b.append(box(516, 14, 200, 56, ['書面通知廠商', '附記未提異議者', '將刊登政府採購公報'], fs=10.5, lead=14))
    b.append(poly([(616, 70), (616, 96), (300, 96), (300, 116)], arrow=uid))
    b.append(poly([(616, 70), (616, 116)], arrow=uid))
    b.append(tag(430, 92, '廠商不服'))
    b.append(tag(680, 92, '未異議 / 申訴無理由'))
    b.append(box(150, 116, 300, 58, ['異議 20 日（§102Ⅰ）→ 機關處理 15 日', '→ 申訴 15 日（§102Ⅱ）',
                                     '不論是否逾公告金額'], fs=10.5, lead=14))
    b.append(box(516, 116, 236, 44, ['刊登政府採購公報', '§102Ⅲ'], fs=11, lead=14, accent=True))
    b.append(line(634, 160, 634, 182, arrow=uid))
    b.append(box(330, 182, 420, 30, ['§103Ⅰ　停權期間，自刊登之次日起算'], fs=11.5))
    b.append(line(540, 212, 540, 230, arrow=uid))
    cols = [
        (16, '3 年', ['第 1～5 款、第 15 款', '第 6 款判處有期徒刑'], True),
        (302, '1 年', ['第 13、14 款', '第 6 款判拘役、罰金或緩刑'], False),
        (588, '3 月 → 6 月 → 1 年', ['第 7～12 款（累進）', '前 5 年未被刊登 3 月；', '已 1 次 6 月；累計 2 次以上 1 年'], False),
    ]
    for x, head, lines, acc in cols:
        b.append(box(x, 230, 276, 88, [head] + lines, accent=acc, fs=10, lead=14, bold_first=True))
    b.append(line(440, 318, 440, 336, arrow=uid))
    b.append(box(180, 336, 520, 44, ['效果：不得參加投標、作為決標對象或分包廠商',
                                     '機關因特殊需要，經上級機關核准者不適用（§103Ⅱ）'], fs=10.5, lead=15, accent=True))
    return dict(id='debar', cat='s', t='§101 → §102 → §103：從事由到停權',
                cap='三條條文是一條流水線：§101 定事由與前置程序，§102 定救濟與刊登，'
                    '§103 定期間與效果。期間分三群，只有第 7～12 款是累進的。',
                aria='停權流程圖：§101 十五款事由、通知前應給予陳述意見並成立採購工作及審查小組、§102 異議二十日申訴十五日、刊登公報後依 §103 分為三年、一年及三月至一年累進三種期間',
                svg=svg(uid, W, H, ''.join(b), '停權流程與期間圖'))
D.append(_debar())

# ============================================================ 8. 五個組織
def _orgs():
    uid = 'ar-org'; W, H = 880, 360
    b = []
    b.append(f'<rect x="215" y="70" width="450" height="150" rx="12" fill="none" '
             f'stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="7 5"/>')
    b.append(txt(440, 92, '辦理採購之機關（自行設置）', fs=11.5, bold=True, color='var(--accent)'))
    b.append(box(235, 106, 200, 96, ['採購工作及審查小組', '§11-1、§101Ⅲ', '巨額工程採購應成立',
                                     '審查需求經費、採購策略、', '招標文件；認定停權事由'], fs=9.5, lead=13.5, bold_first=True))
    b.append(box(445, 106, 200, 96, ['採購評選委員會', '§94', '5 人以上',
                                     '專家學者不得少於 1/3', '且不得為現職公務人員'], fs=9.5, lead=13.5, bold_first=True))
    b.append(txt(14, 26, '政府層級設置（外部監督）', anchor='start', fs=12, bold=True))
    b.append(box(14, 40, 186, 76, ['採購稽核小組', '§108', '中央及直轄市、縣（市）政府',
                                   '稽核監督採購事宜'], fs=9.5, lead=13.5, bold_first=True))
    b.append(box(14, 176, 186, 76, ['工程施工查核小組', '§70Ⅲ', '定期查核工程品質及進度',
                                    '以現場查核為主'], fs=9.5, lead=13.5, bold_first=True))
    b.append(box(680, 108, 186, 76, ['採購申訴審議委員會', '§86', '委員 7～35 人',
                                     '派兼不得逾全體 1/5'], fs=9.5, lead=13.5, bold_first=True))
    b.append(line(200, 78, 236, 108, arrow=uid, op=.5))
    b.append(txt(258, 66, '稽核監督', fs=10, op=.65))
    b.append(line(200, 214, 236, 190, arrow=uid, op=.5))
    b.append(txt(258, 236, '查核工程品質與進度', fs=10, op=.65))
    b.append(box(330, 274, 220, 44, ['廠商'], fs=12))
    b.append(poly([(550, 296), (773, 296), (773, 184)], arrow=uid, op=.5))
    b.append(txt(665, 286, '申訴 ／ 履約爭議調解', fs=10, op=.65))
    b.append(poly([(440, 220), (440, 274)], arrow=uid, op=.5, dash=True))
    b.append(tag(440, 248, '招標決標履約'))
    return dict(id='orgs', cat='z', t='五個小組委員會：誰設的，管什麼',
                cap='虛線框內兩個是「辦理採購的機關自己設」，框外三個是「政府層級設置」來監督機關或處理廠商爭議。'
                    '人數規定只有兩處：評選委員會 5 人以上、專家 1/3；申訴會 7～35 人、派兼不逾 1/5。',
                aria='五個採購組織關係圖：機關內部自設採購工作及審查小組與採購評選委員會；外部由政府層級設置採購稽核小組、工程施工查核小組監督機關，採購申訴審議委員會受理廠商申訴與履約爭議調解',
                svg=svg(uid, W, H, ''.join(b), '採購相關組織關係圖'))
D.append(_orgs())

# ============================================================ 9. GPA 適用
def _gpa():
    uid = 'ar-gpa'; W, H = 880, 372
    b = []
    CX = 300
    b.append(box(CX - 150, 12, 300, 32, ['外國廠商參與機關採購 §17Ⅰ'], accent=True))
    b.append(line(CX, 44, CX, 62, arrow=uid))
    b.append(diamond(CX, 82, 320, 34, ['屬我國締結之條約或協定範圍？']))
    b.append(poly([(CX, 99), (CX, 124), (150, 124), (150, 148)], arrow=uid))
    b.append(poly([(CX, 99), (CX, 124), (450, 124), (450, 148)], arrow=uid))
    b.append(tag(215, 120, '否'))
    b.append(tag(385, 120, '是'))
    b.append(box(30, 148, 240, 44, ['非條約協定採購'], fs=12))
    b.append(diamond(450, 168, 300, 40, ['預估契約值 ≧ 該類門檻金額？'], fs=11))
    b.append(poly([(450, 188), (450, 208), (300, 208), (300, 226)], arrow=uid))
    b.append(poly([(450, 188), (450, 226)], arrow=uid))
    b.append(tag(370, 204, '否'))
    b.append(tag(520, 204, '是'))
    b.append(poly([(150, 192), (150, 250), (196, 250)], arrow=uid))
    b.append(box(196, 226, 208, 44, ['回到左列', '非條約協定採購'], fs=10.5, lead=14, dash=True))
    b.append(box(330, 226, 0, 0, []))
    b.append(box(30, 226, 150, 118, ['適用', '外國廠商參與非條約協定', '採購處理辦法（§17Ⅱ）',
                                     '', '得採 §43 評選優惠', '（比率 ≤ 1/3）', '得採 §44 價差優惠',
                                     '（≤ 3%、≤ 5 年）'], fs=9.5, lead=13.5, bold_first=True))
    b.append(box(420, 226, 240, 118, ['適用 GPA', '國民待遇與不歧視原則', '不得以補償交易為資格',
                                      '條件或決標要件', '', '§43、§44 優惠', '一律不得適用'],
                 accent=True, fs=9.5, lead=14))
    # 門檻表
    b.append(f'<rect x="686" y="140" width="180" height="204" rx="8" fill="var(--panel)" '
             f'stroke="currentColor" stroke-opacity=".3"/>')
    b.append(txt(776, 162, '門檻金額（SDR）', fs=11, bold=True))
    b.append(txt(776, 176, '每兩年換算檢討一次', fs=9, op=.55))
    rows = [('中央機關', '產品／服務 13 萬'), ('次中央機關', '產品／服務 20 萬'),
            ('其他機關', '產品／服務 40 萬'), ('各機關工程', '一律 500 萬')]
    yy = 202
    for k, v in rows:
        b.append(txt(700, yy, k, anchor='start', fs=10, bold=True))
        b.append(txt(700, yy + 14, v, anchor='start', fs=9.5, op=.65))
        yy += 34
    b.append(txt(776, 330, '我國實際門檻以工程會公告為準', fs=8.5, op=.5))
    return dict(id='gpa', cat='w', t='GPA 適用判斷：兩道關卡決定 §43、§44 能不能用',
                cap='先看是否落在條約協定範圍，再看有沒有達到門檻金額。兩關都通過才走 GPA，'
                    '而 GPA 一旦適用，§43、§44 的國內廠商優惠就整組關閉——這是條約協定條款的實際效果。',
                aria='GPA 適用判斷流程圖：先判斷是否屬條約協定範圍，再判斷預估契約值是否達門檻金額；兩者皆是則適用 GPA 且不得適用第四十三條、第四十四條優惠，否則適用外國廠商參與非條約協定採購處理辦法',
                svg=svg(uid, W, H, ''.join(b), 'WTO 政府採購協定適用判斷圖'))
D.append(_gpa())

DIAGRAMS = D
