import React from 'react';
import {boundaryFor,boundaryGap,type Boundary} from './grade-boundaries';
import {paperPart,type Paper} from './model';
import './grade-boundaries.css';

function Sources({row}:{row:Boundary}) {
  return <ul className="boundary-sources">{row.sources.map(s=><li key={s.url}><a href={s.url+(s.page?`#page=${s.page}`:'')} target="_blank" rel="noopener noreferrer">{s.title}{s.page?` · 第 ${s.page} 页`:''} ↗</a>{s.kind==='reproduction'&&<small>考试局原始文档的存档副本</small>}</li>)}</ul>;
}

function QualificationReference({row}:{row:Boundary}) {
  if(!row.qualificationReferences?.length)return null;
  return <div className="boundary-qualification">{row.qualificationReferences.map(ref=><div key={ref.option}><span>A Level A* <strong>{ref.score} / {ref.maxScore}</strong><small>整套参考</small></span><p>{ref.option} 组合 · {ref.components.join(' + ')} · 同场次四卷总分</p></div>)}</div>;
}

export function PaperBoundary({paper}:{paper:Paper}) {
  const row=boundaryFor(paper);
  return <div className="paper-boundary" data-boundary-status={row?.status??'unavailable'}>
    {row?.target?<div className="boundary-target"><span>{row.target.label}{row.target.derived&&<small>换算</small>}</span><strong>{row.target.score}<small> / {row.maxScore}</small></strong></div>:<div className="boundary-unavailable">{paper.subject==='ukcho'?'Gold 线':paper.subject==='cs'?'P2 A 线':paper.subject==='fp1'||paper.subject==='s2'?'90 UMS 线':'Top Gold 线'} · {row?.note.includes('取消')||row?.note.includes('学校评估')?'该场次无常规考试线':'暂未核验'}</div>}
    {row&&<><QualificationReference row={row}/><details className="boundary-disclosure"><summary>{row.scope==='round1'?'整场参考 · ':''}{row.status==='reference'?'转载来源与说明':'分数线说明与来源'}</summary><p>{row.note}</p><Sources row={row}/></details></>}
  </div>;
}

export function ResultBoundary({paper,score,max}:{paper:Paper;score:number;max:number}) {
  if(!paper.year)return null;
  const row=boundaryFor(paper),gap=row&&boundaryGap(row,score,max);
  return <section className="panel result-boundaries" aria-labelledby="result-boundaries-title">
    <div className="panel-heading"><h2 id="result-boundaries-title">本场次分数线</h2><span>{paper.year} · {paperPart(paper)}</span></div>
    {row?.target?<><div className="result-boundary-target"><span>{row.target.label}{row.target.derived?'（换算）':''}</span><strong>{row.target.score}<small> / {row.maxScore}</small></strong></div>{gap&&<p className="boundary-gap">{gap} · 按本次自评分比较</p>}{!gap&&row.scope==='paper'&&max!==row.maxScore&&<p>本次不是完整试卷总分，仅列分数线，不比较等级。</p>}</>:<p className="boundary-unavailable">{row?.note??'暂未核验到与此试卷完全对应的分数线。'}</p>}
    {row&&<>{row.bands.length>0&&<div className="boundary-band-scroll"><table className="boundary-bands"><caption>{row.scope==='round1'?'整个 Round 1':'本卷'}各档最低卷面分（满分 {row.maxScore}）</caption><thead><tr>{row.bands.map(b=><th scope="col" key={b.label}>{b.label}</th>)}</tr></thead><tbody><tr>{row.bands.map(b=><td key={b.label}>{b.score}</td>)}</tr></tbody></table></div>}<QualificationReference row={row}/>{row.target&&<p className="boundary-note">{row.note}</p>}<Sources row={row}/><p className="boundary-checked">资料核对：{paper.subject==='ukcho'?'2026-11-11':'2026-11-02'}</p></>}
  </section>;
}
