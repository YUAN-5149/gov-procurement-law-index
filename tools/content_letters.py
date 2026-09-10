# -*- coding: utf-8 -*-
"""工程會解釋函令索引（政府電子採購網 解釋函令系統）

以瀏覽器逐頁抓取 81 個法規類別的函釋清單後合併去重，只保留索引欄位
（主旨摘要上限 100 字），全文以外部連結回原系統。
"""
import json, os, datetime

SRC = 'letters.json'
BASE = ('https://planpe.pcc.gov.tw/prms/explainLetter/'
        'readPrmsExplainLetterContentDetail?pkPrmsRuleContent=')

def build():
    items = json.load(open(SRC, encoding='utf-8'))
    out = []
    for x in items:
        rec = {'i': x['i'], 's': x['s'], 'd': x.get('d', ''), 'n': x.get('n', '')}
        if x.get('a'):
            rec['a'] = x['a']
        out.append(rec)
    out.sort(key=lambda r: r.get('d', ''), reverse=True)
    by = {}
    for k, r in enumerate(out):
        for a in r.get('a', []):
            by.setdefault(a, []).append(k)
    return {'base': BASE, 'fetched': datetime.date.today().isoformat(),
            'items': out, 'byArt': by}

if __name__ == '__main__':
    d = build()
    print('函釋', len(d['items']), '則 | 涵蓋', len(d['byArt']), '個條號')
    print('JSON', len(json.dumps(d, ensure_ascii=False, separators=(',', ':'))) // 1024, 'KB')
