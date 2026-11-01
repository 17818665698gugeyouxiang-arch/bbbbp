"""Validate the reviewed full-question classification against the unchanged QP/MS bank."""
from pathlib import Path
from collections import Counter
import json,hashlib
from PIL import Image

root=Path(__file__).resolve().parent.parent
bank=json.loads((root/'public/fp1-bank.json').read_text(encoding='utf-8'))
rows=json.loads((root/'scripts/fp1-topic-review.json').read_text(encoding='utf-8'))
names={'complex':'复数','quadratic-roots':'二次方程根的关系','series':'数列与求和','matrices':'矩阵与线性变换','coordinates':'坐标几何','numerical':'数值方法','induction':'数学归纳法'}
questions={q['id']:(p,q) for p in bank for q in p['questions']}
assert len(bank)==27 and len(questions)==244
assert len(rows)==len(questions) and len({r['questionId'] for r in rows})==len(rows)
assert set(questions)=={r['questionId'] for r in rows}
audit=json.loads((root/'scripts/fp1-crop-audit.json').read_text(encoding='utf-8'))
audits={(r['paper'],str(r['question'])):r for r in audit}
evidence=[]
for p in bank:assert sum(q['maxScore'] for q in p['questions'])==p['scoreCap']==75
for r in rows:
 p,q=questions[r['questionId']];assert p['id']==r['paperId']
 assert r['primary'] in names and all(t in names and t!=r['primary'] for t in r['related'])
 a=audits[(p['id'],q['number'])];assert a['scoreVerified'] and a['maxScore']==q['maxScore']
 assert [x['page'] for x in q['prompt']]==[x['page'] for x in a['prompt']]
 assert [x['page'] for x in q['answer']]==a['answerPages']
 assert q['prompt'] and q['answer']
 sources=[]
 for kind,folder,field in [('QP','QP','source'),('MS','MS','answerSource')]:
  f=root/'Edexcel_FP1_2014-2026'/folder/q[field];assert f.read_bytes()[:5]==b'%PDF-'
  sources.append({'kind':kind,'file':q[field],'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 crops=[]
 for kind in ['prompt','answer']:
  for c in q[kind]:
   f=root/'public'/c['src'].lstrip('/');im=Image.open(f);im.load();assert im.width>=200 and im.height>=20
   crops.append({'kind':kind,'src':c['src'],'page':c['page'],'size':list(im.size),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
 evidence.append({**r,'number':q['number'],'maxScore':q['maxScore'],'sources':sources,'crops':crops,'scoreVerified':True})
out={'version':1,'questions':rows}
(root/'public/fp1-topics.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
counts=Counter(r['primary'] for r in rows)
report=['# FP1 完整大题分类核查','',f'27 套试卷，244 道独立大题。保留既有题目、答案图片及题目 ID；各卷总分均为 75。','', '核查方式：逐题阅读 QP 提取文本确认主要题型；综合归纳法题检查相关分类。题目及 MS 页码、分值沿用已核查裁切清单，并逐一验证 PDF、图片解码、完整图片序列和文件指纹。','', '## 主要分类数量','']
for k,v in names.items():report.append(f'- {v}：{counts[k]} 道；含相关分类筛选可找到 {sum(r["primary"]==k or k in r["related"] for r in rows)} 道。')
report+=['','## 逐题清单','','| 原卷 | 题号 | 满分 | 主要分类 | 相关分类 | QP 页 | MS 页 |','|---|---:|---:|---|---|---|---|']
for r in rows:
 p,q=questions[r['questionId']];report.append(f'| {p["id"]} | {q["number"]} | {q["maxScore"]} | {names[r["primary"]]} | {"、".join(names[t] for t in r["related"]) or "—"} | {", ".join(str(c["page"]) for c in q["prompt"])} | {", ".join(str(c["page"]) for c in q["answer"])} |')
(root/'FP1_TOPIC_AUDIT.md').write_text('\n'.join(report)+'\n',encoding='utf-8')
(root/'output/audit').mkdir(parents=True,exist_ok=True)
(root/'output/audit/fp1-topics-evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'papers':len(bank),'questions':len(rows),'primaryCounts':counts,'crops':sum(len(e['crops']) for e in evidence)},ensure_ascii=False))
