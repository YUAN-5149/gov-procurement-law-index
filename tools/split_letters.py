# -*- coding: utf-8 -*-
"""把 data.js 裡的 3,661 則函釋索引抽到獨立的 letters.js。

函釋索引約占 data.js 三分之一，但只有進入「工程會解釋函令」或看母法條文時才需要，
留在 data.js 會拖慢首屏。抽出後 app.js 會在首屏畫完之後才背景載入。

用法：python tools/split_letters.py
重複執行不會有副作用（已經抽過就直接跳過）。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data.js')
LETTERS = os.path.join(ROOT, 'letters.js')


def load(path):
    s = open(path, encoding='utf-8').read()
    return json.loads(s[s.index('=') + 1:].strip().rstrip(';'))


def main():
    d = load(DATA)
    lt = d.get('letters') or {}
    items = lt.get('items')
    if items is None:
        print('data.js 已經是拆分後的版本，無需處理。')
        return
    lt['count'] = len(items)
    lt.pop('items', None)

    with open(LETTERS, 'w', encoding='utf-8') as f:
        f.write('window.LAW_LETTERS = ')
        json.dump(items, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    with open(DATA, 'w', encoding='utf-8') as f:
        f.write('window.LAW = ')
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    print('letters.js  %8d bytes  (%d 則)' % (os.path.getsize(LETTERS), len(items)))
    print('data.js     %8d bytes  (已移除 items)' % os.path.getsize(DATA))


if __name__ == '__main__':
    main()
