# -*- coding: utf-8 -*-
"""把 content_quiz3.py 的題目併進現有的 data.js（不需重新擷取全部法規原始頁面）。

正常的完整流程是跑 gen.py 重新產生 data.js；但只新增題庫時，
用這支腳本直接合併比較快，而且會先檢查每題的條文連結是否存在。

用法：python tools/merge_quiz3.py
重複執行不會重複新增（以題幹比對）。
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from content_quiz3 import Q3   # noqa: E402

DATA = os.path.join(ROOT, 'data.js')


def main():
    raw = open(DATA, encoding='utf-8').read()
    d = json.loads(raw[raw.index('=') + 1:].strip().rstrip(';'))

    arts = set()
    cats = {c['id'] for c in d['cats']}
    for l in d['laws']:
        for a in l['articles']:
            arts.add(l['id'] + '#' + a['no'])

    bad = []
    for i, (c, q, o, a, e, r) in enumerate(Q3):
        if r not in arts:
            bad.append((i, q[:24], r, '條文連結不存在'))
        if c not in cats:
            bad.append((i, q[:24], c, '分類代碼不存在'))
        if not (0 <= a < len(o)):
            bad.append((i, q[:24], a, '正解索引超出選項範圍'))
        if len(o) != 4:
            bad.append((i, q[:24], len(o), '選項數不是 4'))
    if bad:
        for b in bad:
            print('  [錯誤]', b)
        raise SystemExit('題庫有 %d 個問題，未寫入。' % len(bad))

    have = {x['q'] for x in d['quiz']}
    add = [{'c': c, 'q': q, 'o': list(o), 'a': a, 'e': e, 'r': r}
           for c, q, o, a, e, r in Q3 if q not in have]
    if not add:
        print('題目都已存在，無需新增。目前共', len(d['quiz']), '題。')
        return

    d['quiz'].extend(add)
    with open(DATA, 'w', encoding='utf-8') as f:
        f.write('window.LAW = ')
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    by = {}
    for x in d['quiz']:
        by[x['c']] = by.get(x['c'], 0) + 1
    names = {c['id']: c['code'] + ' ' + c['name'] for c in d['cats']}
    print('新增 %d 題，題庫共 %d 題' % (len(add), len(d['quiz'])))
    for c in d['cats']:
        print('   %-14s %3d 題' % (names[c['id']], by.get(c['id'], 0)))


if __name__ == '__main__':
    main()
