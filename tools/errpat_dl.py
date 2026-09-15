# -*- coding: utf-8 -*-
"""抓取工程會函頒之各類型採購錯誤行為態樣附件（優先 .docx）"""
import subprocess, re, os, html, json, time
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120'
B='https://planpe.pcc.gov.tw/prms/explainLetter'

DOCS = [
 ('60046608','選擇性招標錯誤行為態樣'),
 ('60045265','機關傳輸政府採購資訊錯誤行為態樣'),
 ('75003140','最有利標錯誤行為態樣'),
 ('60046859','評分及格最低標／公告金額十分之一以下採購錯誤態樣'),
 ('60045602','政府採購法第22條第1項第7款辦理採購常見錯誤態樣'),
 ('60046858','政府採購法第22條第1項各款執行錯誤態樣'),
 ('60046560','統包招標前置作業參考手冊（含統包錯誤行為態樣）'),
 ('60046524','建築工程規劃設計可能綁標行為態樣'),
 ('70000733','常見保險錯誤及缺失態樣'),
 ('60046902','共同供應契約缺失態樣（訂約機關／訂購機關）'),
]

def page(cid, jar):
    return subprocess.run(['curl','-sSL','--max-time','60','-A',UA,'-c',jar,'-b',jar,
        f'{B}/readPrmsExplainLetterContentDetail?pkPrmsRuleContent={cid}'],
        capture_output=True,text=True,encoding='utf-8').stdout or ''

def grab(cid, name):
    jar=f'jar_{cid}.txt'
    h=page(cid,jar)
    csrf=re.search(r'name="_csrf"\s+value="([^"]+)"',h)
    atts=re.findall(r'downloadFile\((\d+)\)[^<]*</a>',h)
    names=re.findall(r'onclick="downloadFile\(\d+\)"[^>]*>([^<]+)</a>',h)
    pairs=list(zip(re.findall(r'downloadFile\((\d+)\)',h), names)) if names else []
    if not csrf or not pairs:
        os.path.exists(jar) and os.remove(jar)
        return None, f'no attachment (csrf={bool(csrf)}, atts={len(pairs)})'
    # 優先 docx，其次 doc，再其次 pdf
    pick=None
    for ext in ('.docx','.doc','.pdf'):
        for fid,fn in pairs:
            if fn.lower().endswith(ext): pick=(fid,fn); break
        if pick: break
    if not pick: pick=pairs[0]
    fid,fn=pick
    ext=os.path.splitext(fn)[1] or '.bin'
    out=f'errpat_{cid}{ext}'
    r=subprocess.run(['curl','-sSL','--max-time','90','-A',UA,'-b',jar,'-c',jar,'-X','POST',
        '-d',f'pkAttachedFile={fid}','-d',f'_csrf={csrf.group(1)}','-o',out,'-w','%{http_code}',
        f'{B}/downloadFile'],capture_output=True,text=True)
    os.path.exists(jar) and os.remove(jar)
    ok=(r.stdout or '').strip()=='200' and os.path.exists(out) and os.path.getsize(out)>2000
    return (out if ok else None), (f'{fn} → {os.path.getsize(out)//1024}KB' if ok else f'download failed {r.stdout}')

res={}
for cid,name in DOCS:
    f,msg=grab(cid,name)
    print(('OK  ' if f else 'MISS'), cid, name[:28], '|', msg)
    if f: res[cid]={'file':f,'name':name}
    time.sleep(1.0)
json.dump(res,open('errpat_files.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('\n取得', len(res), '份')
