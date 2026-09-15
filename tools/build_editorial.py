"""Build portable HTML with the illustration and styles embedded."""
from pathlib import Path
import base64
p=Path(__file__).resolve().parents[1]
h=(p/'index.html').read_text(encoding='utf-8')
css=(p/'editorial.css').read_text(encoding='utf-8')
js=(p/'app.js').read_text(encoding='utf-8')
art=base64.b64encode((p/'assets/acceptance-editorial.webp').read_bytes()).decode()
js=js.replace('assets/acceptance-editorial.webp','data:image/webp;base64,'+art)
h=h.replace('<link rel="stylesheet" href="editorial.css">','<style>'+css+'</style>')
import re
h=re.sub(r'<script src="data\.js(?:\?v=[0-9a-f]+)?"></script>',
         lambda m: '<script>'+(p/'data.js').read_text(encoding='utf-8')+'</script>', h)
h=re.sub(r'<script src="app\.js(?:\?v=[0-9a-f]+)?"></script>',
         lambda m: '<script>'+js+'</script>', h)
(p/'政府採購法令彙編-單檔版.html').write_text(h,encoding='utf-8')
preview=h.replace('<html lang="zh-Hant-TW"','<html data-start="accept" lang="zh-Hant-TW"',1)
(p/'驗收時程-美編版.html').write_text(preview,encoding='utf-8')
print('Portable and illustrated preview built')
