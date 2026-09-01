# -*- coding: utf-8 -*-
import re, json, html, sys, urllib.request, os
HDR={'User-Agent':'Mozilla/5.0'}

def fetch(pcode):
    fn=f"raw_{pcode}.html"
    if os.path.exists(fn) and os.path.getsize(fn)>5000:
        return open(fn,encoding='utf-8').read()
    url=f"https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode={pcode}"
    h=urllib.request.urlopen(urllib.request.Request(url,headers=HDR),timeout=60).read().decode('utf-8','replace')
    open(fn,'w',encoding='utf-8').write(h)
    return h

def clean(s):
    s=re.sub(r'<br\s*/?>','\n',s)
    s=re.sub(r'<[^>]+>','',s)
    return html.unescape(s).strip()

CH=re.compile(r'<div class="h3 char-(\d+)">(.*?)</div>',re.S)
NO=re.compile(r'<div class="col-no">\s*<a[^>]*name="([^"]+)"[^>]*>(.*?)</a>\s*</div>',re.S)
LINE=re.compile(r'<div class="line-\d+[^"]*">(.*?)</div>',re.S)

def parse(pcode):
    h=fetch(pcode)
    title=clean(re.search(r'<title>(.*?)</title>',h,re.S).group(1)).split('-')[0].strip()
    txt=clean(h)
    m=re.search(r'(?:修正日期|公布日期|發布日期|訂定日期)[：:\s]*(民國\s*\d+\s*年\s*\d+\s*月\s*\d+\s*日)',txt)
    date=re.sub(r'\s','',m.group(1)) if m else ''
    i=h.find('law-reg-content'); body=h[i:] if i>0 else h
    marks=[]
    for m in CH.finditer(body): marks.append((m.start(),m.end(),'ch',int(m.group(1)),clean(m.group(2))))
    for m in NO.finditer(body): marks.append((m.start(),m.end(),'no',m.group(1),clean(m.group(2))))
    marks.sort()
    arts=[]; chain=[]
    for idx,(s,e,kind,a,b) in enumerate(marks):
        nxt=marks[idx+1][0] if idx+1<len(marks) else len(body)
        if kind=='ch':
            lvl=a
            chain=[c for c in chain if c[0]<lvl]
            chain.append((lvl,re.sub(r'\s+',' ',b).strip()))
        else:
            seg=body[e:nxt]
            lines=[clean(x) for x in LINE.findall(seg)]
            lines=[l for l in lines if l]
            if not lines:
                t=clean(seg)
                lines=[t] if t else []
            arts.append({'no':a,'label':re.sub(r'\s+','',b),
                         'chapter':' › '.join(c[1] for c in chain),'lines':lines})
    return {'pcode':pcode,'title':title,'date':date,'articles':arts}

if __name__=='__main__':
    for pc in sys.argv[1:]:
        try:
            d=parse(pc)
            json.dump(d,open(f"law_{pc}.json",'w',encoding='utf-8'),ensure_ascii=False,indent=1)
            print(pc,'OK articles=',len(d['articles']),'date=',d['date'])
        except Exception as ex:
            print(pc,'FAIL',ex)
