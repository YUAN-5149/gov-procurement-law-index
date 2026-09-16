# -*- coding: utf-8 -*-
"""比對站上收錄的法規版本與來源網站現行版本，找出需要重新擷取的法規。

站上每部法規都記錄了擷取當時的「修正日期」（data.js 的 laws[].date）。
這支腳本重新向來源網站要一次該法規的日期，與站上的比對；
只讀取、不修改任何資料，適合放在 GitHub Actions 每月跑一次。

用法：
    python tools/check_updates.py                # 全部檢查，人類可讀的輸出
    python tools/check_updates.py --json out.json  # 另外輸出 JSON 供 CI 使用
    python tools/check_updates.py --limit 5      # 只檢查前 5 部（測試用）

離開碼：0 ＝全部相符或只有無法確認者；1 ＝發現版本不同。
"""
import argparse
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data.js')

MOJ = 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=%s'
PCC = 'https://lawweb.pcc.gov.tw/LawContent.aspx?id=%s'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')

# 全國法規資料庫的 pcode：一個英文字母 + 7 碼數字（A0030057、D0070080…）
# 早期版本只認 'A00' 開頭，害 D00 開頭的兩部法規被當成沒有線上來源而跳過
MOJ_ID = re.compile(r'^[A-Z]\d{7}$')

# 民國日期：民國108年05月22日 / 中華民國 108 年 5 月 22 日
DATE_RE = re.compile(r'民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日')


INSECURE_HOSTS = set()      # 曾因憑證鏈問題而改用未驗證連線的主機


def _decode(raw):
    for enc in ('utf-8', 'big5', 'cp950'):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode('utf-8', 'replace')


def fetch(url, timeout=45, retries=2):
    """讀取頁面，逾時會重試。

    工程會網站（lawweb.pcc.gov.tw）從國外連線特別慢，在 GitHub Actions 的
    美國 runner 上 30 秒常常不夠，因此拉長逾時並加上重試。
    """
    last = None
    for attempt in range(retries + 1):
        try:
            return _fetch_once(url, timeout)
        except Exception as e:                       # noqa: BLE001
            last = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    raise last


def _fetch_once(url, timeout):
    """實際送出一次請求。

    部分政府網站的憑證缺少 Subject Key Identifier，新版 OpenSSL 會拒絕驗證。
    這裡先以正常驗證連線，失敗時才退回未驗證連線並記錄警告——本腳本只讀取
    公開法規頁面並比對日期，不送出任何資料，風險僅止於「日期被誤導」。
    """
    req = urllib.request.Request(url, headers={
        'User-Agent': UA,
        'Accept-Language': 'zh-TW,zh;q=0.9',
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return _decode(r.read())
    except (ssl.SSLError, urllib.error.URLError) as e:
        if not isinstance(e, ssl.SSLError) and not isinstance(getattr(e, 'reason', None), ssl.SSLError):
            raise
        host = urllib.parse.urlparse(url).hostname or url
        if host not in INSECURE_HOSTS:
            INSECURE_HOSTS.add(host)
            print('  ! %s 的憑證無法驗證，改用未驗證連線讀取（只讀公開法規頁面）' % host, flush=True)
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return _decode(r.read())


def norm(d):
    """把各種寫法正規化成 (年, 月, 日)。"""
    m = DATE_RE.search(d or '')
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


TAG_RE = re.compile(r'<[^>]+>')
LABELS = ('修正日期', '公發布日', '公布日期', '發布日期', '訂定日期')


def latest_date(html):
    """抓頁面上「修正日期／公發布日」欄位的日期。

    刻意不取「頁面上最大的日期」——頁面頁尾常有『資料更新日期』之類的今日日期，
    那會讓每一部法規都被誤判成有更新。這裡沿用 tools/parse.py 的作法，
    只認標題明確的欄位。
    """
    txt = TAG_RE.sub(' ', html or '')
    txt = txt.replace('&nbsp;', ' ').replace('　', ' ')
    best = None
    for lab in LABELS:
        for m in re.finditer(lab + r'\s*[：:]?\s*' + DATE_RE.pattern, txt):
            ymd = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
            if best is None or ymd > best:
                best = ymd
        if best:
            return best          # 依標籤優先序，找到就用
    return None


def load_laws():
    s = open(DATA, encoding='utf-8').read()
    d = json.loads(s[s.index('=') + 1:].strip().rstrip(';'))
    return d['laws']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', dest='json_out')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--sleep', type=float, default=1.0, help='每次請求間隔秒數，別把來源站打爆')
    ap.add_argument('--retries', type=int, default=2, help='逾時重試次數')
    ap.add_argument('--timeout', type=float, default=45, help='單次請求逾時秒數')
    args = ap.parse_args()

    laws = load_laws()
    if args.limit:
        laws = laws[:args.limit]

    changed, same, unknown = [], [], []
    for i, l in enumerate(laws, 1):
        lid, title, have = l['id'], l['title'], l.get('date', '')
        if MOJ_ID.match(lid):
            url = MOJ % lid
        elif lid.startswith(('FL', 'GL')):
            url = PCC % lid
        else:
            unknown.append({'id': lid, 'title': title, 'have': have, 'why': '非線上來源（函頒文件）'})
            continue
        try:
            html = fetch(url, timeout=args.timeout, retries=args.retries)
            now = latest_date(html)
        except Exception as e:                      # noqa: BLE001
            why = '讀取失敗：%s' % e
            if 'timed out' in str(e):
                why = '來源站無回應（重試 %d 次仍逾時，可能限制國外連線）' % args.retries
            unknown.append({'id': lid, 'title': title, 'have': have, 'why': why})
            time.sleep(args.sleep)
            continue

        mine = norm(have)
        if not now or not mine:
            unknown.append({'id': lid, 'title': title, 'have': have, 'why': '頁面沒有可辨識的日期'})
            mark = '?'
        elif now > mine:
            changed.append({'id': lid, 'title': title, 'have': have,
                            'now': '民國%d年%02d月%02d日' % now, 'url': url})
            mark = '★ 有更新'
        else:
            same.append(lid)
            mark = 'ok'
        print('[%3d/%3d] %-40s %s' % (i, len(laws), title[:40], mark), flush=True)
        time.sleep(args.sleep)

    print('\n===== 結果 =====')
    noreply = [u for u in unknown if '無回應' in u['why']]
    offline = [u for u in unknown if '非線上來源' in u['why']]
    print('相符：%d　·　可能有更新：%d　·　無法確認：%d（來源站無回應 %d、本無線上來源 %d）'
          % (len(same), len(changed), len(unknown), len(noreply), len(offline)))
    for c in changed:
        print('  ★ %s（站上 %s → 來源 %s）\n     %s' % (c['title'], c['have'], c['now'], c['url']))
    for u in unknown[:10]:
        print('  ? %s：%s' % (u['title'][:30], u['why']))

    if args.json_out:
        with open(args.json_out, 'w', encoding='utf-8') as f:
            json.dump({'changed': changed, 'unknown': unknown, 'same': len(same),
                       'noreply': len(noreply), 'offline': len(offline)},
                      f, ensure_ascii=False, indent=1)

    # 在 GitHub Actions 上把摘要寫進執行頁面。
    # 沒有這段的話，只要沒有法規被修正就不會開 issue，看起來一片綠，
    # 但實際上可能有幾十部根本沒驗到——這件事必須看得見。
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write('## 法規版本比對\n\n')
            f.write('| 結果 | 部數 |\n|---|---|\n')
            f.write('| 與站上版本相符 | %d |\n' % len(same))
            f.write('| **可能已修正** | **%d** |\n' % len(changed))
            f.write('| 來源站無回應 | %d |\n' % len(noreply))
            f.write('| 本無線上來源（函頒文件） | %d |\n' % len(offline))
            if changed:
                f.write('\n### 可能已修正\n\n')
                for c in changed:
                    f.write('- [%s](%s)：站上 %s → 來源 %s\n' % (c['title'], c['url'], c['have'], c['now']))
            if noreply:
                f.write('\n> 有 %d 部法規的來源站沒有回應，**這次沒有驗到**。\n'
                        '> 工程會網站（lawweb.pcc.gov.tw）從 GitHub 的美國機房連線常常逾時，\n'
                        '> 需要完整比對時請在台灣本機執行 `python tools/check_updates.py`。\n' % len(noreply))

    return 1 if changed else 0


if __name__ == '__main__':
    sys.exit(main())
