# -*- coding: utf-8 -*-
"""以標準函式庫解析 .docx：抽出段落與表格（保留列結構）"""
import zipfile, re
from xml.etree import ElementTree as ET
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def _para_text(p):
    out = []
    for node in p.iter():
        tag = node.tag.split('}')[-1]
        if tag == 't' and node.text:
            out.append(node.text)
        elif tag in ('br', 'cr'):
            out.append('\n')
        elif tag == 'tab':
            out.append('\t')
    return ''.join(out).strip()

def read(path):
    """回傳 [('p', text)] 或 [('row', [cell, cell, ...])] 的序列"""
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml')
    root = ET.fromstring(xml)
    body = root.find('w:body', NS)
    items = []
    for child in body:
        tag = child.tag.split('}')[-1]
        if tag == 'p':
            t = _para_text(child)
            if t:
                items.append(('p', t))
        elif tag == 'tbl':
            for tr in child.findall('w:tr', NS):
                cells = []
                for tc in tr.findall('w:tc', NS):
                    ps = [_para_text(p) for p in tc.findall('w:p', NS)]
                    cells.append('\n'.join(x for x in ps if x))
                if any(c.strip() for c in cells):
                    items.append(('row', cells))
    return items

if __name__ == '__main__':
    import sys
    items = read(sys.argv[1])
    print('items:', len(items),
          '| paragraphs:', sum(1 for k, _ in items if k == 'p'),
          '| rows:', sum(1 for k, _ in items if k == 'row'))
    for k, v in items[:14]:
        print(k, '::', (v if k == 'p' else ' | '.join(c.replace('\n', ' / ')[:46] for c in v))[:150])
