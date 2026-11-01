import {useEffect,useMemo,useState,useRef} from 'react';
import {ArrowLeft,ArrowRight,Shuffle,BookOpen} from 'lucide-react';
import {assetUrl} from './site-config';
import {type Paper,type Session,type Mistake,type Grade,elapsed,duration,result,paperPart} from './model';
import {type TopicAttempt,type TopicIndex,type TopicId,type TopicRef,topicNames,isTopicId,filterTopics,sampleTopics,validateTopicIndex,resolveTopic,topicView,topicTitle} from './topics';
import {startTopic,updateTopic,submitTopic,draftTopicGrade,saveTopicGrade} from './topic-store';
import {syncNow} from './local-sync';
import {db} from './db';
import {Training,Marking,Result} from './practice';
import {QuestionSearch} from './question-search';
import './fp1-topics.css';

type Props={papers:Paper[];sessions:Session[];attempts:TopicAttempt[];mistakes:Mistake[];revision:number;attemptId:string;openAttempt:(id:string)=>void;openSession:(s:Session)=>void;openMistake:(m:Mistake)=>void;addMistake:(p:Paper,q:string)=>Promise<Mistake>;back:()=>void;refresh:()=>void;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<void>};
type Selection={years:number[];topics:TopicId[];count:string;preview:TopicRef[];questionId:string;mode:'assemble'|'browse';scroll:number;offset:number};
const key='study-fp1-topics-selection-v1';
function loadSelection(years:number[]):Selection{
 const fallback:Selection={years,topics:[],count:'5',preview:[],questionId:'',mode:'assemble',scroll:0,offset:0};
 try{const s=JSON.parse(localStorage.getItem(key)??'null');if(!s)return fallback;return {...fallback,years:Array.isArray(s.years)?s.years.filter((y:number)=>years.includes(y)):years,topics:Array.isArray(s.topics)?s.topics.filter(isTopicId):[],count:typeof s.count==='string'?s.count:'5',preview:Array.isArray(s.preview)?s.preview.filter((r:TopicRef)=>typeof r?.paperId==='string'&&typeof r?.questionId==='string'):[],questionId:typeof s.questionId==='string'?s.questionId:'',mode:s.mode==='browse'?'browse':'assemble',scroll:Number.isFinite(s.scroll)?s.scroll:0,offset:Number.isInteger(s.offset)&&s.offset>=0?s.offset:0};}catch{return fallback;}
}
const stamp=(t:number)=>new Date(t).toLocaleString('zh-CN');
export function TopicHistory({attempts,papers,open}:{attempts:TopicAttempt[];papers:Paper[];open:(id:string)=>void}){
 if(!attempts.length)return null;
 return <section className="topic-history"><h2>FP1 专项记录</h2><div className="panel history-list">{[...attempts].sort((a,b)=>b.startedAt-a.startedAt).map(a=>{const v=topicView(a,papers),r=result(v.session,v.paper);return <button className="history-row" key={a.id} onClick={()=>open(a.id)}><BookOpen size={20}/><div><strong>{topicTitle(a)}</strong><small>{stamp(a.startedAt)} · {a.refs.length} 道完整大题</small></div><span className="history-time">{a.submittedAt?duration(elapsed(v.session)):'计时中'}</span><span className={`status ${a.completedAt?'completed':''}`}>{a.completedAt?`${r.score} / ${r.max} 分`:a.submittedAt?'待批改':'进行中'}</span><ArrowRight size={16}/></button>;})}</div></section>;
}
export function FP1Topics(p:Props){
 const years=useMemo(()=>[...new Set(p.papers.filter(x=>x.subject==='fp1'&&!x.legacy).map(x=>x.year))].sort((a,b)=>b-a),[p.papers]);
 const [selection,setSelection]=useState(()=>loadSelection(years)),[index,setIndex]=useState<TopicIndex>(),[error,setError]=useState('');
 const latest=useRef(selection);latest.current=selection;
 useEffect(()=>{let alive=true;fetch(assetUrl('/fp1-topics.json')).then(r=>{if(!r.ok)throw Error('分类清单加载失败，请重新加载。');return r.json();}).then(data=>{validateTopicIndex(data,p.papers);if(alive)setIndex(data);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[p.papers]);
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(selection));}catch{/* Personal learning records remain in IndexedDB. */}},[selection]);
 useEffect(()=>{
  if(p.attemptId||!index)return;
  const target=latest.current.scroll;let restoring=target>0,frame=0;
  const restore=()=>{if(!restoring)return;window.scrollTo(0,target);if(Math.abs(window.scrollY-target)<2)restoring=false;};
  const observer=new ResizeObserver(restore);observer.observe(document.body);frame=requestAnimationFrame(restore);
  const cancelRestore=()=>{restoring=false;observer.disconnect();};
  const save=()=>{if(restoring)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>setSelection(s=>({...s,scroll:window.scrollY})));};
  window.addEventListener('scroll',save,{passive:true});window.addEventListener('wheel',cancelRestore,{passive:true});window.addEventListener('touchstart',cancelRestore,{passive:true});
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',save);window.removeEventListener('wheel',cancelRestore);window.removeEventListener('touchstart',cancelRestore);};
 },[p.attemptId,index]);
 const pool=useMemo(()=>index?filterTopics(index,p.papers,selection.years,selection.topics):[],[index,p.papers,selection.years,selection.topics]);
 const sorted=useMemo(()=>[...pool].sort((a,b)=>{const x=resolveTopic(a,p.papers),y=resolveTopic(b,p.papers);return y.paper.year-x.paper.year||(x.paper.month??0)-(y.paper.month??0)||x.paper.id.localeCompare(y.paper.id)||Number(x.question.number)-Number(y.question.number);}),[pool,p.papers]);
 const changeFilters=(patch:Partial<Selection>)=>setSelection(s=>{const next={...s,...patch,preview:[],questionId:'',offset:0,scroll:0};const n=index?filterTopics(index,p.papers,next.years,next.topics).length:0;next.count=String(Math.min(5,n)||5);return next;});
 const a=p.attempts.find(a=>a.id===p.attemptId);
 if(p.attemptId){
  if(!a)return <section className="panel"><p className="muted">此浏览器暂未找到这条专项记录。同步完成后可从训练记录重新打开。</p><button className="text-button" onClick={()=>p.openAttempt('')}>返回分类题库</button></section>;
  const {session,paper,originalPaperIds}=topicView(a,p.papers),shared={session,paper,busy:p.busy,run:p.run,refresh:p.refresh};
  if(!a.submittedAt)return <Training {...shared} updateSession={patch=>updateTopic(a.id,patch)} submit={async()=>{await submitTopic(a.id);p.refresh();}}/>;
  if(!a.completedAt)return <Marking key={`${a.id}-${a.markingPosition}`} {...shared} originalPaperIds={originalPaperIds} draftGrade={(qid,change)=>draftTopicGrade(a.id,qid,change)} persistGrade={(qid,grade,next,finish)=>saveTopicGrade(a.id,qid,grade,next,finish,p.papers)} finish={p.refresh}/>;
  return <Result session={session} paper={paper} review={i=>p.run(async()=>{await updateTopic(a.id,{markingPosition:i,completedAt:undefined});p.refresh();})} back={()=>p.openAttempt('')}/>;
 }
 if(error)return <div className="alert error" role="alert">{error}<button onClick={()=>location.reload()}>重新加载</button></div>;
 if(!index)return <p className="muted">正在加载分类题库…</p>;
 const count=Number(selection.count),validCount=selection.count.trim()!==''&&Number.isInteger(count)&&count>=1&&count<=pool.length;
 const previewValid=selection.preview.length>0&&selection.preview.every(r=>pool.some(x=>x.paperId===r.paperId&&x.questionId===r.questionId))&&new Set(selection.preview.map(r=>r.questionId)).size===selection.preview.length;
 const selected=pool.find(r=>r.questionId===selection.questionId),selectedQuestion=selected?resolveTopic(selected,p.papers):undefined;
 const active=p.attempts.find(x=>!x.submittedAt),mockActive=p.sessions.find(x=>!x.submittedAt&&!x.archived),previewMax=previewValid?selection.preview.reduce((n,r)=>n+resolveTopic(r,p.papers).question.maxScore,0):0;
 return <div className="fp1-topics"><button className="text-button" onClick={p.back}><ArrowLeft size={16}/>返回 FP1 题库</button><div className="page-title"><div><h1>分类题库</h1><p>按年份与题型查阅完整大题，或随机组成专项练习。</p></div><span className="library-total">{index.questions.length} 道大题</span></div>
  <div className="segmented topic-mode" aria-label="分类题库模式">{(['assemble','browse'] as const).map(mode=><button key={mode} className={selection.mode===mode?'selected':''} onClick={()=>setSelection(s=>({...s,mode}))}>{mode==='assemble'?'专项组卷':'查阅题目'}</button>)}</div>
  <div className="topic-filters"><fieldset><legend>选择年份 <button className="text-button" type="button" onClick={()=>changeFilters({years:selection.years.length===years.length?[]:years})}>{selection.years.length===years.length?'清空年份':'全选年份'}</button></legend><div className="topic-options">{years.map(y=><label key={y}><input type="checkbox" checked={selection.years.includes(y)} onChange={()=>changeFilters({years:selection.years.includes(y)?selection.years.filter(x=>x!==y):[...selection.years,y]})}/>{y}</label>)}</div></fieldset>
  <fieldset><legend>选择题型 <button className="text-button" type="button" onClick={()=>changeFilters({topics:selection.topics.length===7?[]:Object.keys(topicNames) as TopicId[]})}>{selection.topics.length===7?'清空题型':'全选题型'}</button></legend><div className="topic-options topic-types">{(Object.entries(topicNames) as [TopicId,string][]).map(([id,name])=><label key={id}><input type="checkbox" checked={selection.topics.includes(id)} onChange={()=>changeFilters({topics:selection.topics.includes(id)?selection.topics.filter(t=>t!==id):[...selection.topics,id]})}/>{name}</label>)}</div></fieldset></div>
  <p className="topic-count" role="status">{pool.length} 道符合条件的完整大题{!selection.years.length?' · 请先选择年份':!selection.topics.length?' · 请选择题型':' · 综合题按相关题型匹配，不重复计数'}</p>
  {selection.mode==='assemble'?<>
   <form className="topic-assemble" onSubmit={e=>{e.preventDefault();if(validCount){setError('');setSelection(s=>({...s,preview:sampleTopics(pool,count)}));}}}><label>大题数量<input aria-label="专项大题数量" type="number" min={1} max={pool.length||1} step={1} value={selection.count} onChange={e=>setSelection(s=>({...s,count:e.target.value,preview:[]}))}/></label><button className="primary" type="submit" disabled={!validCount}><Shuffle size={16}/>{previewValid?'重新生成':'生成组卷'}</button>{pool.length>0&&!validCount&&<span className="field-error">请输入 1 至 {pool.length} 之间的整数。</span>}</form>
   {previewValid&&<section className="topic-preview"><div className="section-heading"><h2>本次组卷</h2><span>{selection.preview.length} 道大题 · 满分 {previewMax} 分</span></div><ol>{selection.preview.map(r=>{const {paper,question}=resolveTopic(r,p.papers);return <li key={r.questionId}><span>{paper.year} · {paperPart(paper)} · {paper.specification==='old'?'旧版':'新版'} · 第 {question.number} 题</span><strong>{question.maxScore} 分</strong></li>;})}</ol><button className="primary" disabled={p.busy||!!active||!!mockActive} onClick={()=>p.run(async()=>{await syncNow(true);const attempt=await startTopic(selection.preview,selection.years,selection.topics,p.papers);try{await syncNow(true);}catch(e){await db.topicAttempts.delete(attempt.id);throw e;}p.refresh();p.openAttempt(attempt.id);})}>开始专项练习<ArrowRight size={16}/></button></section>}
  </>:<><div className="topic-results">{sorted.slice(selection.offset,selection.offset+20).map(r=>{const {paper,question}=resolveTopic(r,p.papers);return <button key={r.questionId} aria-pressed={selection.questionId===r.questionId} className="topic-question-row" onClick={()=>setSelection(s=>({...s,questionId:r.questionId}))}><span><strong>{paper.year} · {paperPart(paper)} · 第 {question.number} 题</strong><small>{topicNames[r.primary]} · {r.tags.join('、')} · {paper.specification==='old'?'旧版':'新版'}</small></span><b>{question.maxScore} 分</b><ArrowRight size={16}/></button>;})}</div>{sorted.length>20&&<div className="button-row topic-pagination"><button className="secondary" disabled={selection.offset===0} onClick={()=>setSelection(s=>({...s,offset:Math.max(0,s.offset-20)}))}>上一页</button><span>{Math.floor(selection.offset/20)+1} / {Math.ceil(sorted.length/20)}</span><button className="secondary" disabled={selection.offset+20>=sorted.length} onClick={()=>setSelection(s=>({...s,offset:s.offset+20}))}>下一页</button></div>}
   {selectedQuestion&&<QuestionSearch key={selectedQuestion.question.id} detailOnly collapseAnswer subject="fp1" papers={p.papers} sessions={p.sessions} topicAttempts={p.attempts} openTopic={p.openAttempt} mistakes={p.mistakes} choice={{year:String(selectedQuestion.paper.year),paperId:selectedQuestion.paper.id,questionId:selectedQuestion.question.id,resultQuestionId:selectedQuestion.question.id}} change={()=>{}} revision={p.revision} addMistake={p.addMistake} openSession={p.openSession} openMistake={p.openMistake}/>}
  </>}
  {active&&<div className="resume"><div><strong>有一场未交卷的 FP1 专项</strong><p>计时持续进行，交卷后可以开始新的练习。</p></div><button className="primary" onClick={()=>p.openAttempt(active.id)}>继续专项</button></div>}
  {mockActive&&<div className="info">已有未交卷模考，请先继续并交卷。<button className="text-button" onClick={()=>p.openSession(mockActive)}>继续模考</button></div>}
  <TopicHistory attempts={p.attempts} papers={p.papers} open={p.openAttempt}/>
 </div>;
}
