# -*- coding: utf-8 -*-
"""工程會函頒之其他各類型採購錯誤行為態樣

來源：政府電子採購網解釋函令系統之函附件。
可解析者僅限具文字層之檔案；掃描影像 PDF（§22各款執行錯誤態樣、
評分及格最低標、共同供應契約缺失態樣）此環境無 OCR，未收錄。
"""
import re
import fitz
import doc_read

BASE = ('https://planpe.pcc.gov.tw/prms/explainLetter/'
        'readPrmsExplainLetterContentDetail?pkPrmsRuleContent=')

_CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7,
       '八': 8, '九': 9, '十': 10}

def _cn2n(s):
    t = n = 0
    for ch in s:
        if ch in _CN and ch != '十':
            n = _CN[ch]
        elif ch == '十':
            t += (n or 1) * 10
            n = 0
    return t + n

STAGE = re.compile(r'^([一二三四五六七八九十]{1,3})、(.{2,24})$')
ITEM = re.compile(r'^[（(]([一二三四五六七八九十]{1,3})[）)]$')
NOISE = re.compile(r'^(橢橢|赠虲|類別及序號|錯誤行為態樣|錯誤態樣|依\s*據|'
                   r'疏失性質/依據法令|依據法令|序號|項次|\d+)$')

def _lines_doc(path):
    return [l for l in doc_read.read(path) if not NOISE.match(l.strip())]

def _lines_pdf(path):
    d = fitz.open(path)
    t = '\n'.join(p.get_text() for p in d)
    d.close()
    out = [l.strip() for l in t.split('\n') if l.strip()]
    return [l for l in out if not NOISE.match(l)]

def parse_table(lines, basis_hint=None):
    """階段 →（N）→ 內容（可跨行）→ 依據 的三段式態樣表"""
    arts, stage_no, stage_name = [], 0, '（未分階段）'
    cur = None
    def flush():
        nonlocal cur
        if not cur:
            return
        body = ' '.join(cur['body']).strip()
        basis = ' '.join(cur['basis']).strip()
        if body:
            ls = [body]
            if basis:
                ls.append('【依據】' + basis)
            arts.append({'no': f"{cur['s']}-{cur['i']}", 'ch': cur['sn'],
                         'label': f"{cur['scn']}（{cur['icn']}）" if cur['s'] else f"（{cur['icn']}）",
                         'lines': ls})
        cur = None
    # 抽取時階段標記與名稱可能被拆成兩行（例如「三、」＋「開標之監辦程序」），先合併
    merged = []
    k = 0
    while k < len(lines):
        l = lines[k]
        if re.match(r'^[一二三四五六七八九十]{1,3}、$', l.strip()) and k + 1 < len(lines)                 and not ITEM.match(lines[k + 1]) and len(lines[k + 1]) < 26:
            merged.append(l.strip() + lines[k + 1].strip())
            k += 2
            continue
        merged.append(l)
        k += 1
    lines = merged

    for l in lines:
        ms = STAGE.match(l)
        if ms and len(l) < 26:
            flush()
            stage_no = _cn2n(ms.group(1))
            stage_name = l
            continue
        mi = ITEM.match(l)
        if mi:
            flush()
            cur = {'s': stage_no, 'sn': stage_name, 'scn': stage_name.split('、')[0],
                   'i': _cn2n(mi.group(1)), 'icn': mi.group(1), 'body': [], 'basis': []}
            continue
        if cur is None:
            continue
        # 判斷是內容還是依據：依據多以法規名稱起頭或以句點結尾且含「法/辦法/標準/細則/令/函」
        is_basis = bool(re.match(r'^(政府採購法|採購法|本法|施行細則|最有利標|投標廠商資格|'
                                 r'行政疏失|本會|工程會)', l)) or l.strip() in ('行政疏失',)
        (cur['basis'] if is_basis else cur['body']).append(l)
    flush()
    return arts

def parse_checklist(lines):
    """階段 → 逐項檢核事項（無編號、無依據欄）"""
    STAGES = ('準備招標文件', '決標程序', '履約階段', '驗收階段', '招標文件',
              '履約管理', '保險理賠', '其他')
    arts, stage, n = [], '（總則）', 0
    for l in lines:
        if l in STAGES or (len(l) <= 8 and l in ('準備招標文件', '決標程序')):
            stage = l
            n = 0
            continue
        if len(l) < 8 or l.startswith(('標案名稱', '標案案號', '檢核事項', '與本案無關',
                                       '檢核人簽章', '機關辦理保險事項檢核表')):
            continue
        if re.match(r'^\d+年\d+月\d+日', l):
            continue
        n += 1
        arts.append({'no': f'{len(arts)+1}', 'label': f'檢核 {n}', 'ch': stage, 'lines': [l]})
    return arts

DOCS = [
    dict(id='EP_SEL', src='errpat_60046608.doc', kind='doc', shape='table', cat='b',
         title='選擇性招標錯誤行為態樣', short='選擇性招標態樣',
         date='民國105年11月28日', cid='60046608'),
    dict(id='EP_22_7', src='errpat_60045602.doc', kind='doc', shape='table', cat='b',
         title='政府採購法第22條第1項第7款辦理採購常見錯誤態樣', short='§22Ⅰ⑦錯誤態樣',
         date='民國96年08月29日', cid='60045602'),
    dict(id='EP_INFO', src='errpat_60045265.pdf', kind='pdf', shape='table', cat='b',
         title='機關傳輸政府採購資訊錯誤行為態樣', short='資訊傳輸錯誤態樣',
         date='民國94年03月04日', cid='60045265'),
    dict(id='EP_INS', src='errpat_70000733.doc', kind='doc', shape='checklist', cat='p',
         title='機關辦理保險事項檢核表（常見保險錯誤及缺失態樣）', short='保險事項檢核表',
         date='民國111年04月06日', cid='70000733'),
]

def build():
    out = []
    for d in DOCS:
        lines = _lines_doc(d['src']) if d['kind'] == 'doc' else _lines_pdf(d['src'])
        arts = parse_table(lines) if d['shape'] == 'table' else parse_checklist(lines)
        for a in arts:
            a['cat'] = d['cat']
        if not arts:
            continue
        out.append({'id': d['id'], 'title': d['title'], 'short': d['short'],
                    'date': d['date'], 'kind': '函頒', 'multi': True,
                    'url': BASE + d['cid'], 'articles': arts})
    return out

if __name__ == '__main__':
    for law in build():
        print(f"{law['id']:<9s} {law['date']:<16s} {len(law['articles']):>3d} 項  {law['title']}")
        chs = []
        for a in law['articles']:
            if a['ch'] not in chs:
                chs.append(a['ch'])
        print('    階段:', ' / '.join(chs[:8]))
        for a in law['articles'][:2]:
            print(f"      {a['label']}  {a['lines'][0][:66]}")
            if len(a['lines']) > 1:
                print(f"              {a['lines'][1][:60]}")
        print()
