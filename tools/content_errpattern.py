# -*- coding: utf-8 -*-
"""政府採購錯誤行為態樣（工程會 113.12.05 工程企字第1130100044號函頒）

來源為函頒之 .docx 附件（政府電子採購網解釋函令系統），非法規資料庫條文；
以「階段 → 態樣」結構轉為條文物件，每一態樣可獨立搜尋並連回相關法令。
"""
import re
import docx_read

SRC = 'err_pattern.docx'
URL = ('https://planpe.pcc.gov.tw/prms/explainLetter/'
       'readPrmsExplainLetterContentDetail?pkPrmsRuleContent=75003100')

# 階段 → 網站八大分類
STAGE_CAT = {
    1: 'b', 2: 'b', 3: 'b', 4: 'b', 5: 'b', 6: 'b', 7: 'b',   # 準備招標文件～領標投標
    8: 'd', 9: 'd', 10: 'd',                                   # 開標、審標、決標
    11: 'p',                                                   # 履約
    12: 'b',                                                   # 圍標之嫌（另掛罰則）
}
STAGE_XC = {12: ['s']}

_CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6,
       '七': 7, '八': 8, '九': 9, '十': 10}

def _cn2n(s):
    t = n = 0
    for ch in s:
        if ch in _CN and ch != '十':
            n = _CN[ch]
        elif ch == '十':
            t += (n or 1) * 10
            n = 0
    return t + n

def _clean_stage(s):
    """段落標題可能重複（頁首殘留），取最後一個階段標記起算"""
    s = re.sub(r'\s+', '', s).rstrip('：:')
    ms = list(re.finditer(r'[一二三四五六七八九十]{1,3}、', s))
    if ms:
        s = s[ms[-1].start():]
    for k in (4, 3, 2):             # 儲存格換行造成的尾段重複，例如「訂定廠商資格資格」
        if len(s) > 2 * k and s[-k:] == s[-2 * k:-k]:
            s = s[:-k]
            break
    return s.strip()

def build():
    items = docx_read.read(SRC)

    # 1) 逐段收集各階段的「作業指引」
    guides = {}          # stage_no -> 指引全文
    cur = None
    for kind, val in items:
        if kind != 'p':
            continue
        t = val.strip()
        m = re.match(r'^\s*(?:([一二三四五六七八九十]{1,3})、)?(.{2,30}?)[：:]\s*$', _clean_stage(t) + '：')
        if re.search(r'[一二三四五六七八九十]{1,3}、.{2,30}[：:]?$', _clean_stage(t)) and len(t) < 60:
            st = _clean_stage(t)
            mm = re.match(r'^([一二三四五六七八九十]{1,3})、', st)
            if mm:
                cur = _cn2n(mm.group(1))
                guides.setdefault(cur, {'name': st, 'text': []})
                continue
        if cur and len(t) > 40:
            guides[cur]['text'].append(t)

    # 準備招標文件段落沒有「一、」前綴，補上
    if 1 not in guides:
        for kind, val in items:
            if kind == 'p' and val.strip().startswith('準備招標文件'):
                cur = 1
                guides[1] = {'name': '一、準備招標文件', 'text': []}
                break
        idx = [i for i, (k, v) in enumerate(items) if k == 'p' and v.strip().startswith('準備招標文件')]
        if idx and idx[0] + 1 < len(items) and items[idx[0] + 1][0] == 'p':
            guides[1]['text'].append(items[idx[0] + 1][1])

    # 2) 逐列收集態樣
    arts = []
    stage_no, stage_name = None, ''
    emitted_guide = set()
    for kind, val in items:
        if kind != 'row':
            continue
        cells = [c.strip() for c in val]
        if cells[0].startswith('序號'):
            continue
        if cells[0]:
            st = _clean_stage(cells[0])
            mm = re.match(r'^([一二三四五六七八九十]{1,3})、', st)
            if mm:
                stage_no = _cn2n(mm.group(1))
                stage_name = st
        if stage_no is None or len(cells) < 3:
            continue

        # 該階段第一次出現時，先放入作業指引
        if stage_no not in emitted_guide:
            emitted_guide.add(stage_no)
            g = guides.get(stage_no)
            if g and g['text']:
                arts.append({
                    'no': f'{stage_no}-0', 'label': '作業指引',
                    'ch': stage_name, 'cat': STAGE_CAT.get(stage_no, 'z'),
                    'xc': STAGE_XC.get(stage_no, []),
                    'lines': [x for x in g['text'] if x],
                })

        item_cn = cells[1].strip('（）() ')
        body = cells[2].strip()
        law = cells[3].strip() if len(cells) > 3 else ''
        if not body:
            continue
        j = _cn2n(item_cn) if item_cn else len(arts)
        lines = [body]
        if law:
            lines.append('【相關法令及函釋】' + law)
        rec = {
            'no': f'{stage_no}-{j}',
            'label': f'{stage_name.split("、")[0]}（{item_cn}）',
            'ch': stage_name,
            'cat': STAGE_CAT.get(stage_no, 'z'),
            'lines': lines,
        }
        if STAGE_XC.get(stage_no):
            rec['xc'] = STAGE_XC[stage_no]
        arts.append(rec)

    return {
        'id': 'ERRPAT',
        'title': '政府採購錯誤行為態樣',
        'short': '錯誤行為態樣',
        'date': '民國113年12月05日',
        'kind': '函頒',
        'multi': True,
        'url': URL,
        'articles': arts,
    }

if __name__ == '__main__':
    d = build()
    print(d['title'], d['date'], len(d['articles']), '項')
    chs = []
    for a in d['articles']:
        if a['ch'] not in chs:
            chs.append(a['ch'])
    for c in chs:
        n = [a for a in d['articles'] if a['ch'] == c]
        print(f'  {c:<24s} {len(n):3d} 項  cat={n[0]["cat"]}')
    print('--- 抽樣 ---')
    for a in d['articles'][:3] + d['articles'][-2:]:
        print(' ', a['no'], a['label'], '|', a['lines'][0][:60])
