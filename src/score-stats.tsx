import {useState} from 'react';
import {type Paper,type Session,result,validScore} from './model';

export function scoredAttempts(papers:Paper[],sessions:Session[]) {
  const lookup=new Map(papers.filter(p=>!p.legacy).map(p=>[p.id,p]));
  return sessions.flatMap(session=>{
    const paper=lookup.get(session.paperId);
    if(!paper||session.archived||!session.completedAt||!session.submittedAt||!session.questionIds.length)return [];
    if(!session.questionIds.every(id=>{const q=paper.questions.find(q=>q.id===id);return q&&validScore(session.grades[id]?.score??'',q.maxScore);}))return [];
    const total=result(session,paper);
    return [{session,paper,...total}];
  }).sort((a,b)=>a.session.startedAt-b.session.startedAt||a.session.id.localeCompare(b.session.id));
}
const localTime=(t:number)=>new Date(t).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
export function ScoreStats({papers,sessions,open}:{papers:Paper[];sessions:Session[];open:(s:Session)=>void}) {
  const [year,setYear]=useState('all'),[paperId,setPaperId]=useState('all');
  const all=scoredAttempts(papers,sessions),years=[...new Set(papers.map(p=>p.year))].sort((a,b)=>b-a);
  const options=papers.filter(p=>year==='all'||p.year===Number(year));
  const rows=all.filter(r=>(year==='all'||r.paper.year===Number(year))&&(paperId==='all'||r.paper.id===paperId));
  const top=Math.max(10,Math.ceil(Math.max(...rows.map(r=>r.max),0)/10)*10),width=Math.max(680,rows.length*94+100),left=52,bottom=244,height=190,step=(width-left-22)/Math.max(rows.length,1);
  return <section className="panel score-statistics" aria-label="分数统计"><details open={all.length>0}><summary className="score-summary"><h2>分数统计</h2><span>{all.length?`${all.length} 次已完成训练`:'暂无成绩'}</span></summary><div className="score-details"><p className="score-description">纵轴：得分 · 横轴：训练开始的本地时间；柱上标注试卷年份，点击可查看训练。</p>
    <div className="score-filters"><label>试卷年份<select aria-label="统计年份" value={year} onChange={e=>{setYear(e.target.value);setPaperId('all');}}><option value="all">全部年份</option>{years.map(y=><option key={y}>{y}</option>)}</select></label><label>试卷<select aria-label="统计试卷" value={paperId} onChange={e=>setPaperId(e.target.value)}><option value="all">全部试卷</option>{options.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><span>{rows.length} 次已完成训练{rows.length>0&&` · 平均得分率 ${(rows.reduce((n,r)=>n+(r.max?r.score/r.max:0),0)/rows.length*100).toFixed(1)}%`}</span></div>
    {!rows.length?<p className="score-empty">暂无已完成批改的成绩。完成一次训练和批改后，这里会显示统计。</p>:<><div className="score-chart-scroll" tabIndex={0} aria-label="成绩条形图，可横向滚动"><svg className="score-chart" width={width} height="338" role="group" aria-label="按本地训练时间排列的成绩条形图">
      <text x="5" y="18" className="chart-axis-title">得分</text>
      {[0,1,2,3,4].map(i=>{const y=bottom-height*i/4;return <g key={i}><line x1={left} x2={width-12} y1={y} y2={y} className="chart-grid"/><text x={left-10} y={y+4} textAnchor="end" className="chart-axis-label">{top*i/4}</text></g>;})}
      {rows.map((r,i)=>{const x=left+step*(i+.5),bar=Math.min(46,step*.58),h=r.score/top*height,label=`${r.paper.title}，${localTime(r.session.startedAt)}，${r.score} / ${r.max} 分`;return <g key={r.session.id} role="button" tabIndex={0} aria-label={label} className="chart-attempt" onClick={()=>open(r.session)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(r.session);}}}>
        <title>{label}</title><rect x={x-step/2+2} y="24" width={step-4} height="306" fill="transparent"/><rect className="chart-bar" x={x-bar/2} y={bottom-Math.max(h,2)} width={bar} height={Math.max(h,2)} rx="4"/>
        <text x={x} y={bottom-Math.max(h,2)-19} textAnchor="middle" className="chart-year">{r.paper.year} 年</text><text x={x} y={bottom-Math.max(h,2)-5} textAnchor="middle" className="chart-value">{r.score} / {r.max}</text>
        <text x={x} y={bottom+22} textAnchor="middle" className="chart-axis-label">{new Date(r.session.startedAt).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})}</text><text x={x} y={bottom+39} textAnchor="middle" className="chart-axis-label">{new Date(r.session.startedAt).toLocaleTimeString('zh-CN',{hour12:false})}</text>
      </g>;})}<text x={width/2} y="326" textAnchor="middle" className="chart-axis-title">本地训练时间（按先后顺序）</text>
    </svg></div><p className="score-footnote">各卷满分可能不同，柱上同时显示得分与满分。仅统计当前科目已完成批改的训练。</p></>}
  </div></details></section>;
}
