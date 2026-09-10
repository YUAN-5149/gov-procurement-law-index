# -*- coding: utf-8 -*-
"""從政府電子採購網解釋函令系統下載附件（需 session + CSRF）"""
import subprocess, re, os, sys
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'
BASE = 'https://planpe.pcc.gov.tw'

def fetch_attachment(content_id, file_id, out):
    jar = f'jar_{content_id}.txt'
    page = subprocess.run(
        ['curl', '-sSL', '--max-time', '60', '-A', UA, '-c', jar, '-b', jar,
         f'{BASE}/prms/explainLetter/readPrmsExplainLetterContentDetail?pkPrmsRuleContent={content_id}'],
        capture_output=True, text=True, encoding='utf-8').stdout or ''
    m = re.search(r'name="_csrf"\s+value="([^"]+)"', page)
    if not m:
        return None, 'no csrf'
    csrf = m.group(1)
    r = subprocess.run(
        ['curl', '-sSL', '--max-time', '90', '-A', UA, '-b', jar, '-c', jar,
         '-X', 'POST', '-d', f'pkAttachedFile={file_id}', '-d', f'_csrf={csrf}',
         '-o', out, '-w', '%{http_code} %{size_download}',
         f'{BASE}/prms/explainLetter/downloadFile'],
        capture_output=True, text=True)
    os.path.exists(jar) and os.remove(jar)
    return (r.stdout or '').strip(), csrf

if __name__ == '__main__':
    cid, fid, out = sys.argv[1], sys.argv[2], sys.argv[3]
    res, csrf = fetch_attachment(cid, fid, out)
    print('result:', res)
    if os.path.exists(out):
        with open(out, 'rb') as f:
            head = f.read(4)
        print('size:', os.path.getsize(out), 'magic:', head.hex(' '))
