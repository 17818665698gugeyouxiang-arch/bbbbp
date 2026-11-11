"""Download and validate official RSC archive assets, preserving valid PDFs."""
import re, json, html, hashlib, urllib.request, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'UKChO_Round1_2014-2026'
def run():
 s=(ROOT/'tmp/ukcho/archive.html').read_text(encoding='utf-8-sig'); jobs=[]
 for m in re.finditer(r'<h3[^>]*>\s*(20(?:1[4-9]|2[0-6]))\s*</h3>(.*?)(?=<h3|$)',s,re.S):
  for url,label in re.findall(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>',m[2],re.S):
   label=re.sub('<[^>]+>','',html.unescape(label))
   kind={'Past paper':'QP','Mark scheme':'MS','Supporting materials':'Reference','Answer booklet':'AnswerBooklet'}.get(label,'Report')
   jobs.append(dict(year=int(m[1]),kind=kind,url=html.unescape(url)))
 def fetch(row):
  target=DEST/row['kind']/f"UKChO_{row['year']}_{row['kind']}.pdf";target.parent.mkdir(parents=True,exist_ok=True)
  if not target.exists() or not target.read_bytes().startswith(b'%PDF-'):
   for host in ['https://d1ymz67w5raq8g.cloudfront.net','https://edu.rsc.org']:
    try:
     req=urllib.request.Request(row['url'].replace('https://edu.rsc.org',host),headers={'User-Agent':'Mozilla/5.0'})
     data=urllib.request.urlopen(req,timeout=60).read()
     if not data.startswith(b'%PDF-'):raise ValueError('Not PDF')
     target.write_bytes(data);break
    except Exception as e:last=str(e)
   else:return {**row,'error':last}
  with fitz.open(target) as doc:pages=len(doc)
  return {**row,'file':str(target.relative_to(ROOT)).replace('\\','/'),'pages':pages,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
 with ThreadPoolExecutor(max_workers=5) as pool:
  result=list(pool.map(fetch,jobs))
 DEST.mkdir(exist_ok=True);(DEST/'sources.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(json.dumps({'downloaded':sum('file'in r for r in result),'errors':[r for r in result if 'error'in r]},indent=2))
if __name__=='__main__':run()
