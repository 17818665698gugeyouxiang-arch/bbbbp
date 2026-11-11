"""Verified RSC boundaries; unavailable years are explicitly labelled."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sources=json.loads((ROOT/'UKChO_Round1_2014-2026/sources.json').read_text())
scores={2014:[35,22,14],2015:[38,22,14],2016:[41,26,18],2017:[41,29,20],2018:[40,25,16],2020:[37,22,12],2021:[36,25,17],2022:[26,16,9],2023:[38,24,14],2024:[30,18,10],2025:[29,16,9],2026:[38,23,13]}
articles={2020:'https://edu.rsc.org/rsc-education-news/uk-chemistry-olympiad-2020-round-1-results-released/4011253.article',2021:'https://edu.rsc.org/rsc-education-news/round-one-results-of-chemistry-olympiad-2021-released/4013313.article',2023:'https://edu.rsc.org/rsc-education-news/round-one-results-of-2023-chemistry-olympiad/4017073.article'}
pages={2014:1,2015:3,2016:4,2017:5,2018:4,2022:1,2024:1,2025:1,2026:1}
catalog=ROOT/'src/grade-boundaries.json';data=json.loads(catalog.read_text(encoding='utf-8'));data['records']=[r for r in data['records']if not r['paperId'].startswith('ukcho-')]
for p in json.loads((ROOT/'public/ukcho-bank.json').read_text(encoding='utf-8')):
 y=p['year'];bands=scores.get(y)
 row=dict(paperId=p['id'],status='verified'if bands else'unavailable',scope='paper',maxScore=p['scoreCap'],bands=[],note='RSC 官方英国 Round 1 奖项最低卷面分；与本次完整试卷自评分比较，不代表官方评奖结果。'if bands else'暂未核验到 2019 年 RSC 官方奖项线，不推算。',sources=[])
 if bands:
  row['target']={'label':'Gold 线','score':bands[0]};row['bands']=[dict(label=k,score=v)for k,v in zip(['Gold','Silver','Bronze'],bands)]
  url=articles.get(y)or next(r['url']for r in sources if r['year']==y and r['kind']=='Report')
  row['sources']=[dict(title=f'RSC {y} Round 1 '+('results'if y in articles else'examiners’ report'),url=url,kind='official',**({'page':pages[y]}if y in pages else{}))]
 if not bands:row['sources']=[dict(title='RSC official archive (award boundaries not verified)',url='https://edu.rsc.org/uk-chemistry-olympiad/chemistry-olympiad-past-papers/1641.article',kind='official')]
 data['records'].append(row)
catalog.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
