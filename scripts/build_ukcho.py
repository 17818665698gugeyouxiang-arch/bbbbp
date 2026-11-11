"""Build complete UKChO questions from official PDFs; no formula re-typesetting."""
from pathlib import Path
import re,json,shutil
import pymupdf as fitz
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'UKChO_Round1_2014-2026';OUT=ROOT/'public';AUDIT=ROOT/'output/ukcho'
def anchors(doc):
 found={}
 for i,p in enumerate(doc):
  text=p.get_text();m=re.search(r'(?:Q\s*)?(\d+)\.?\s*This question is about',text,re.I)
  if m:
   n=int(m[1]);assert n not in found,(n,i)
   # All official main questions start on a fresh page; preserve whole content area.
   found[n]=i
 return found
def render(doc,i,rel,trim=True):
 page=doc[i];rect=page.rect
 pix=page.get_pixmap(matrix=fitz.Matrix(1.8,1.8),clip=rect,alpha=False)
 im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
 if trim:
  # Trim only surrounding white space; chemical diagrams are preserved as pixels.
  from PIL import ImageChops
  box=ImageChops.difference(im,Image.new('RGB',im.size,'white')).getbbox()
  if box:im=im.crop((0,max(0,box[1]-12),im.width,min(im.height,box[3]+12)))
 target=OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);im.save(target,'WEBP',quality=94,method=2)
 return {'src':'/'+rel.as_posix(),'page':i+1}
def build():
 AUDIT.mkdir(parents=True,exist_ok=True);bank=[];audit=[]
 sources=json.loads((SRC/'sources.json').read_text())
 for year in range(2014,2027):
  docs={k:fitz.open(SRC/k/f'UKChO_{year}_{k}.pdf')for k in ['QP','MS']}
  for k in ['AnswerBooklet','Reference']:
   p=SRC/k/f'UKChO_{year}_{k}.pdf'
   if p.exists():docs[k]=fitz.open(p)
  qa,ma=anchors(docs['QP']),anchors(docs['MS']);count=len(qa)
  assert sorted(qa)==sorted(ma)==list(range(1,count+1)),(year,qa,ma)
  covertext=docs['QP'][0].get_text();tail=re.split(r'Marks\s+Available',covertext)[1]
  marks=list(map(int,re.match(r'\s*((?:\d+\s+)+)',tail)[1].split()))
  assert len(marks)==count+1 and sum(marks[:-1])==marks[-1],(year,marks)
  msmarks=list(map(int,re.findall(r'(?:Question\s+[Tt]otal|Total out of)\s*(\d+)', '\n'.join(p.get_text()for p in docs['MS']))))
  assert msmarks==marks[:-1],(year,msmarks,marks)
  pid=f'ukcho-{year}-round1';base=Path('ukcho')/pid;questions=[]
  # Exclude acknowledgements/reference bibliographies and end-of-paper tables from question ranges.
  qend=next((i for i in range(max(qa.values())+1,len(docs['QP']))if re.search(r'Acknowledgements|PERIODIC TABLE|Periodic Table|Physical Constants',docs['QP'][i].get_text())),len(docs['QP']))
  # 2019–2023 final periodic table can be image-only; official question ends before it.
  if 2019<=year<=2022:qend=min(qend,len(docs['QP'])-1)
  if year==2023:qend=min(qend,len(docs['QP'])-2)
  ba=anchors(docs['AnswerBooklet'])if 'AnswerBooklet'in docs else {}
  for n in range(1,count+1):
   qp=list(range(qa[n],qa.get(n+1,qend)));mp=list(range(ma[n],ma.get(n+1,len(docs['MS']))))
   assert qp and mp,(year,n)
   title=re.search(r'This question is about\s*([^\n]+)',docs['QP'][qa[n]].get_text())[1].strip()
   prompt=[render(docs['QP'],i,base/f'q{n}/prompt/{i+1:02}.webp')for i in qp]
   answer=[render(docs['MS'],i,base/f'q{n}/answer/{i+1:02}.webp')for i in mp]
   templates=[]
   if ba:
    assert sorted(ba)==list(range(1,count+1)),(year,ba)
    templates=[render(docs['AnswerBooklet'],i,base/f'q{n}/template/{i+1:02}.webp')for i in range(ba[n],ba.get(n+1,len(docs['AnswerBooklet'])))]
   questions.append(dict(id=pid+f'-q{n}',number=str(n),title=title,maxScore=marks[n-1],prompt=prompt,answer=answer,templates=templates,source=f'UKChO {year} Round 1 · QP '+','.join(str(i+1)for i in qp),answerSource=f'RSC official MS · '+','.join(str(i+1)for i in mp)))
   audit.append(dict(year=year,question=n,maxScore=marks[n-1],qpPages=[i+1 for i in qp],msPages=[i+1 for i in mp],templatePages=[c['page']for c in templates],title=title))
  coverpages=[0,*range(1,qa[1]),*range(qend,len(docs['QP']))]
  coverpages=[i for i in sorted(set(coverpages)) if 'Acknowledgements'not in docs['QP'][i].get_text()]
  cover=[render(docs['QP'],i,base/f'cover/qp-{i+1:02}.webp',False)for i in coverpages]
  if 'Reference'in docs:cover.extend(render(docs['Reference'],i,base/f'cover/reference-{i+1:02}.webp',False)for i in range(len(docs['Reference'])))
  general=[render(docs['MS'],0,base/'notes/ms-01.webp',False)]
  bank.append(dict(id=pid,subject='ukcho',year=year,title=f'{year} UKChO Round 1',instructions='按原卷完成全部大题。在纸上作答；只计用时，整卷交卷后逐题自评。原卷时长为 2 小时，本训练不设倒计时。',choose=count,scoreCap=marks[-1],questions=questions,cover=cover,markingNotes=general,ready=True))
  for k,doc in docs.items():doc.close()
  for r in sources:
   if r['year']==year and 'file'in r:
    target=OUT/'ukcho'/pid/'downloads'/Path(r['file']).name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/r['file'],target)
 (OUT/'ukcho-bank.json').write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 (AUDIT/'question-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
 (AUDIT/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps({'papers':len(bank),'questions':len(audit),'years':[{ 'year':p['year'],'questions':len(p['questions']),'score':p['scoreCap']}for p in bank]},indent=2))
if __name__=='__main__':build()
