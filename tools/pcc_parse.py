# -*- coding: utf-8 -*-
"""解析行政院公共工程委員會主管法規查詢系統 LawContent.aspx 頁面"""
import re, html

BOX = '┌┬┐├┼┤└┴┘│─'
_CN = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
def cn2n(s):
    t = 0; n = 0
    for ch in s:
        if ch in _CN: n = _CN[ch]
        elif ch == '十': t += (n or 1) * 10; n = 0
    return t + n

def clean(s):
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    s = s.replace(' ', ' ').replace('\r', '')
    return s

def parse(fid):
    h = open(f'pcc_{fid}.html', encoding='utf-8').read()
    title = clean(re.search(r'<title>(.*?)</title>', h, re.S).group(1)).strip()
    title = title.split('主管法規共用系統-')[-1].replace('法規內容-', '').strip()

    flat = re.sub(r'[ \t]+', ' ', clean(re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h, flags=re.S)))
    def field(name):
        m = re.search(name + r'\s*[:：]\s*\n?\s*(.+)', flat)
        return m.group(1).strip() if m else ''
    date = field('修正日期') or field('公發布日') or field('訂定日期')
    date = re.sub(r'\s+', '', date)
    m = re.search(r'民國(\d+)年(\d+)月(\d+)日', date)
    date = f'民國{m.group(1)}年{m.group(2).zfill(2)}月{m.group(3).zfill(2)}日' if m else date

    i = h.find('law-reg-content')
    body = h[i:] if i > 0 else h
    j = body.find('</table>')
    body = body[:j] if j > 0 else body

    arts = []
    for tr in re.findall(r'<tr>(.*?)</tr>', body, re.S):
        tds = re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)
        if len(tds) < 2:
            continue
        no_raw = clean(tds[0]).strip()
        txt = clean(tds[1])
        if not txt.strip():
            continue
        mono = any(c in txt for c in BOX)
        if mono:
            lines = [txt.rstrip()]
        else:
            lines = [l.strip() for l in txt.split('\n')]
            lines = [l for l in lines if l]
        m = re.match(r'第\s*(\d+(?:\s*之\s*\d+)?)\s*[條點]', no_raw)
        if m:
            no = re.sub(r'\s*之\s*', '-', m.group(1))
            label = '第' + no.replace('-', '之') + ('點' if '點' in no_raw else '條')
        else:
            # 行政規則多以「一、」「壹、」分點，無條號欄；由內文首字推導點次
            m2 = re.match(r'^\s*([一二三四五六七八九十]{1,3})、', lines[0])
            m3 = re.match(r'^\s*([壹貳參肆伍陸柒捌玖拾])、', lines[0])
            if m2:
                no = str(cn2n(m2.group(1))); label = '第' + m2.group(1) + '點'
            elif m3:
                no = str(len(arts) + 1); label = m3.group(1) + '、'
            else:
                no = str(len(arts) + 1)
                label = no_raw or ('全文' if len(arts) == 0 else '（' + no + '）')
        rec = {'no': no, 'label': label, 'lines': lines}
        if mono:
            rec['mono'] = True
        arts.append(rec)
    return {'id': fid, 'title': title, 'date': date, 'articles': arts}

if __name__ == '__main__':
    import sys, json
    for fid in sys.argv[1:]:
        d = parse(fid)
        print(fid, '|', d['date'], '|', len(d['articles']), '條 |', d['title'])
        for a in d['articles'][:2]:
            print('   ', a['label'], '::', a['lines'][0][:70].replace('\n', ' / '))
