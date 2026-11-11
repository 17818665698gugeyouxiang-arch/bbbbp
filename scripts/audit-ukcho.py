import json,re
from pathlib import Path
from PIL import Image,ImageDraw
import pymupdf as fitz
ROOT=Path(__file__).resolve().parents[1];bank=json.loads((ROOT/'public/ukcho-bank.json').read_text(encoding='utf-8'));out=ROOT/'tmp/ukcho/contact';out.mkdir(parents=True,exist_ok=True)
issues=[];counts={}
for paper in bank:
 cells=[]
 for q in paper['questions']:
  for kind in ['prompt','answer','templates']:
   for c in q.get(kind,[]):
    im=Image.open(ROOT/'public'/c['src'].lstrip('/'));im.thumbnail((190,265));cell=Image.new('RGB',(210,292),'#ececec');cell.paste(im,((210-im.width)//2,22));ImageDraw.Draw(cell).text((5,4),f"Q{q['number']} {kind} p{c['page']}",fill='black');cells.append(cell)
    counts[kind]=counts.get(kind,0)+1
 # QP/MS page ranges must be continuous and non-overlapping.
 for kind,key in [('QP','prompt'),('MS','answer')]:
  pages=[c['page']for q in paper['questions']for c in q[key]]
  assert len(pages)==len(set(pages)) and pages==list(range(pages[0],pages[-1]+1)),(paper['id'],key,pages)
  with fitz.open(ROOT/f"UKChO_Round1_2014-2026/{kind}/UKChO_{paper['year']}_{kind}.pdf") as doc:
   for i in pages:
    for b in doc[i-1].get_text('dict')['blocks']:
     for line in b.get('lines',[]):
      t=''.join(s['text']for s in line['spans']).strip();x0,y0,x1,y1=line['bbox']
      if t and not re.fullmatch(r'\d+',t) and 'downloaded from'not in t and (x0<0 or x1>doc[i-1].rect.width or y0<0 or y1>doc[i-1].rect.height):issues.append(dict(paper=paper['id'],kind=kind,page=i,text=t,bbox=line['bbox']))
 cols=7;sheet=Image.new('RGB',(210*cols,292*((len(cells)+cols-1)//cols)),'white')
 for i,cell in enumerate(cells):sheet.paste(cell,((i%cols)*210,(i//cols)*292))
 sheet.save(out/f"{paper['year']}.jpg",quality=90)
report={'papers':len(bank),'questions':sum(len(p['questions'])for p in bank),'crops':counts,'outsideBodyText':issues}
(ROOT/'output/ukcho/crop-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=False)[:6000])
