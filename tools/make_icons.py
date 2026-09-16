# -*- coding: utf-8 -*-
"""產生 PWA 圖示與分享預覽圖（assets/icon-192.png、icon-512.png、og.png）。

用法：python tools/make_icons.py
需要 Pillow 與系統中文字型（Windows 的微軟正黑體 msjh.ttc）。
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'assets')
os.makedirs(OUT, exist_ok=True)

RED = (138, 31, 43)
CREAM = (246, 245, 241)
INK = (28, 26, 23)
INK3 = (124, 118, 108)
GOLD = (154, 116, 41)

FONTS = [r'C:\Windows\Fonts\msjhbd.ttc', r'C:\Windows\Fonts\msjh.ttc',
         r'C:\Windows\Fonts\mingliub.ttc', r'C:\Windows\Fonts\mingliu.ttc']


def font(size, bold=True):
    order = FONTS if bold else FONTS[1:] + FONTS[:1]
    for f in order:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                pass
    return ImageFont.load_default()


def centered(draw, box, text, fnt, fill):
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x0 + (x1 - x0 - (r - l)) / 2 - l, y0 + (y1 - y0 - (b - t)) / 2 - t), text, font=fnt, fill=fill)


def icon(size):
    im = Image.new('RGB', (size, size), RED)
    d = ImageDraw.Draw(im)
    pad = round(size * 0.14)
    d.rectangle([pad, pad, size - pad, size - pad], outline=CREAM, width=max(2, round(size * 0.018)))
    centered(d, (pad, pad, size - pad, size - pad - round(size * 0.06)), '採', font(round(size * 0.46)), CREAM)
    bar = round(size * 0.07)
    d.rectangle([size / 2 - bar * 1.6, size - pad - round(size * 0.085),
                 size / 2 + bar * 1.6, size - pad - round(size * 0.065)], fill=(214, 173, 92))
    return im


for n in (192, 512):
    p = os.path.join(OUT, 'icon-%d.png' % n)
    icon(n).save(p, optimize=True)
    print('wrote', p)

# --- 分享預覽圖 ---
W, H = 1200, 630
og = Image.new('RGB', (W, H), CREAM)
d = ImageDraw.Draw(og)
d.rectangle([0, 0, 26, H], fill=RED)
d.text((96, 104), '政府採購法令彙編', font=font(78), fill=INK)
d.text((100, 214), '學 習 索 引 網 站', font=font(34), fill=RED)
d.rectangle([100, 286, 250, 292], fill=GOLD)
lines = [
    '95 部法規 · 1,508 條全文檢索　|　3,661 則工程會函釋索引',
    '九張流程圖 · 16 張速記卡 · 12 組概念比較',
    '間隔重複測驗 · 模擬考 · 金額與期限試算',
]
y = 334
for ln in lines:
    d.text((100, y), ln, font=font(30, bold=False), fill=INK3)
    y += 52
d.text((100, H - 78), 'yuan-5149.github.io/gov-procurement-law-index', font=font(26, bold=False), fill=INK3)
p = os.path.join(OUT, 'og.png')
og.save(p, optimize=True)
print('wrote', p)
