# -*- coding: utf-8 -*-
"""更新 index.html 的 ?v= 版號與 sw.js 的快取版本。

改過 app.js / data.js 之後執行，使用者才不會拿到舊檔：
    python tools/bump_version.py
"""
import hashlib
import os
import re
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def md5(path):
    return hashlib.md5(open(path, 'rb').read()).hexdigest()[:8]


def main():
    idx = os.path.join(ROOT, 'index.html')
    html = open(idx, encoding='utf-8').read()
    for fn in ('data.js', 'app.js'):
        fp = os.path.join(ROOT, fn)
        if not os.path.exists(fp):
            continue
        h = md5(fp)
        html = re.sub(r'(<script src="' + fn + r')(\?v=[0-9a-f]+)?(")',
                      lambda m: m.group(1) + '?v=' + h + m.group(3), html)
        print(fn, '->', h)
    open(idx, 'w', encoding='utf-8').write(html)

    swp = os.path.join(ROOT, 'sw.js')
    if os.path.exists(swp):
        sw = open(swp, encoding='utf-8').read()
        parts = [md5(os.path.join(ROOT, f)) for f in ('index.html', 'app.js', 'data.js')
                 if os.path.exists(os.path.join(ROOT, f))]
        ver = datetime.date.today().isoformat() + '-' + hashlib.md5(''.join(parts).encode()).hexdigest()[:6]
        sw = re.sub(r"const VERSION = '[^']*';", "const VERSION = '%s';" % ver, sw, count=1)
        open(swp, 'w', encoding='utf-8').write(sw)
        print('sw.js VERSION ->', ver)


if __name__ == '__main__':
    main()
