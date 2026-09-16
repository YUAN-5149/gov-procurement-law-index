"""把整個網站壓成可離線使用的單一 HTML（含插圖、函釋索引與全部功能）。

產出：
  政府採購法令彙編-單檔版.html   完整網站，複製到隨身碟或手機也能用
  驗收時程-美編版.html           同一份內容，但開啟時直接停在驗收時程圖解

用法：python tools/build_editorial.py
"""
from pathlib import Path
import base64
import re

p = Path(__file__).resolve().parents[1]
h = (p / 'index.html').read_text(encoding='utf-8')
css = (p / 'editorial.css').read_text(encoding='utf-8')
js = (p / 'app.js').read_text(encoding='utf-8')

# 插圖轉成 data URI
art = base64.b64encode((p / 'assets/acceptance-editorial.webp').read_bytes()).decode()
js = js.replace('assets/acceptance-editorial.webp', 'data:image/webp;base64,' + art)

h = h.replace('<link rel="stylesheet" href="editorial.css">', '<style>' + css + '</style>')

# 單檔版沒有伺服器，PWA 與圖示連結會 404，直接拿掉
h = re.sub(r'\n<link rel="manifest"[^>]*>', '', h)
h = re.sub(r'\n<link rel="(?:icon|apple-touch-icon)"[^>]*>', '', h)
h = re.sub(r'\n<meta property="og:image"[^>]*>', '', h)

# 函釋索引在正式站是延後載入的獨立檔，單檔版必須一起內嵌，否則離線就查不到
letters = p / 'letters.js'
if letters.exists():
    h = re.sub(r'<script src="data\.js(?:\?v=[0-9a-f]+)?"></script>',
               lambda m: '<script>' + letters.read_text(encoding='utf-8') + '</script>\n' + m.group(0), h)

h = re.sub(r'<script src="data\.js(?:\?v=[0-9a-f]+)?"></script>',
           lambda m: '<script>' + (p / 'data.js').read_text(encoding='utf-8') + '</script>', h)
h = re.sub(r'<script src="app\.js(?:\?v=[0-9a-f]+)?"></script>',
           lambda m: '<script>' + js + '</script>', h)

out = p / '政府採購法令彙編-單檔版.html'
out.write_text(h, encoding='utf-8')

preview = h.replace('<html lang="zh-Hant-TW"', '<html data-start="accept" lang="zh-Hant-TW"', 1)
(p / '驗收時程-美編版.html').write_text(preview, encoding='utf-8')

print('單檔版已產生：%.1f MB' % (out.stat().st_size / 1048576))
