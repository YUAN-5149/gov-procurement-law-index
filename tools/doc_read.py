# -*- coding: utf-8 -*-
"""從 Word 97-2003 (.doc, OLE) 的 WordDocument stream 粗抽文字。

沒有 LibreOffice / antiword 可用，故以 UTF-16LE 解碼後保留可列印片段。
無法還原表格結構，僅適用於「逐段可讀」即足夠的文件。
"""
import olefile, re

KEEP = re.compile(r'[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef0-9A-Za-z'
                  r'()（）「」『』、，。．：；？！%／/\-—～~＋+·\s]')

def read(path):
    ole = olefile.OleFileIO(path)
    raw = ole.openstream('WordDocument').read()
    ole.close()
    txt = raw.decode('utf-16-le', 'ignore')
    # 逐字過濾，控制字元轉換行
    out = []
    for ch in txt:
        if ch in '\r\v\x07\x0c':
            out.append('\n')
        elif KEEP.match(ch):
            out.append(ch)
        else:
            out.append('\n')
    s = ''.join(out)
    s = re.sub(r'[ \t]+', ' ', s)
    lines = [l.strip() for l in s.split('\n')]
    # 只留下有意義的行：含中文且長度足夠
    keep = []
    for l in lines:
        if len(l) < 2:
            continue
        cjk = len(re.findall(r'[\u4e00-\u9fff]', l))
        if cjk == 0 and not re.match(r'^[（(]?[一二三四五六七八九十\d]+[）)、.]', l):
            continue
        if cjk and cjk / max(len(l), 1) < 0.25 and len(l) > 20:
            continue
        keep.append(l)
    return keep

if __name__ == '__main__':
    import sys
    ls = read(sys.argv[1])
    print(f'抽出 {len(ls)} 行')
    for l in ls[:40]:
        print('  ', l[:90])
