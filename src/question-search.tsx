import {useEffect,useState} from 'react';
import {ArrowUpRight,Search,Bookmark,FileText} from 'lucide-react';
import {db,mistakeId} from './db';
import {type Paper,type Session,type Mistake,type Entry,type Photo,type Subject,subjects,paperPart,duration,elapsed,validScore} from './model';
import {type SearchChoice,searchablePapers,questionAttempts,legacyAttempts,attemptEntries,changeSearchYear,changeSearchPaper} from './search-model';
import {Crops,Modal} from './media';
import {CSAnswers,CSReference} from './cs-answers';

const timestamp=(value:number)=>new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
type Props={subject:Subject;papers:Paper[];sessions:Session[];mistakes:Mistake[];choice:SearchChoice;change:(next:SearchChoice)=>void;revision:number;addMistake:(paper:Paper,questionId:string)=>Promise<Mistake>;openSession:(session:Session)=>void;openMistake:(mistake:Mistake)=>void};

export function QuestionSearch({subject,papers,sessions,mistakes,choice,change,revision,addMistake,openSession,openMistake}:Props){
 const [csSeason,setCSSeason]=useState('');
 const bank=searchablePapers(papers,subject),math=subject!=='bpho';
 const years=[...new Set(bank.map(p=>p.year))].sort((a,b)=>b-a);
 const inYear=bank.filter(p=>String(p.year)===choice.year).sort((a,b)=>(math?(a.month??0)-(b.month??0):(a.section??0)-(b.section??0))||a.id.localeCompare(b.id));
 const selectedSeason=csSeason||inYear.find(p=>p.id===choice.paperId)?.examSeries||'';
 const paper=inYear.find(p=>p.id===choice.paperId),question=paper?.questions.find(q=>q.id===choice.resultQuestionId);
 const chosen=paper?.questions.find(q=>q.id===choice.questionId);
 const [adding,setAdding]=useState(false),[addError,setAddError]=useState(''),[added,setAdded]=useState<Mistake>();
 const [showNotes,setShowNotes]=useState(false),[reload,setReload]=useState(0);
 const [media,setMedia]=useState<{questionId:string;entries:Entry[];photos:Photo[];error:string;loading:boolean}>({questionId:'',entries:[],photos:[],error:'',loading:false});
 useEffect(()=>{
  let alive=true;setShowNotes(false);
  if(!question){setMedia({questionId:'',entries:[],photos:[],error:'',loading:false});return;}
  setMedia({questionId:question.id,entries:[],photos:[],error:'',loading:true});
  (async()=>{
   // Read by exact question identity, including retained photos from removed mistake links.
   const entries=await db.entries.where('mistakeId').equals(mistakeId(question.id)).toArray();
   const photos=entries.length?await db.photos.where('entryId').anyOf(entries.map(e=>e.id)).toArray():[];
   if(alive)setMedia({questionId:question.id,entries,photos,error:'',loading:false});
  })().catch(e=>{if(alive)setMedia({questionId:question.id,entries:[],photos:[],error:e instanceof Error?e.message:'过程记录读取失败',loading:false});});
  return()=>{alive=false;};
 },[question?.id,revision,reload]);
 const attempts=paper&&question?questionAttempts(sessions,paper.id,question.id):[];
 const old=paper?legacyAttempts(papers,sessions,paper):[];
 const mistake=question?(mistakes.find(m=>m.paperId===paper?.id&&m.questionId===question.id)??(added?.questionId===question.id?added:undefined)):undefined;
 const entries=media.questionId===question?.id?media.entries:[],photos=media.questionId===question?.id?media.photos:[];
 const later=attemptEntries(entries);
 return <div className="question-search">
  <div className="page-title"><div><h1>搜题</h1><p>选择原卷信息，查看题目、答案与自己的每一次练习。</p></div></div>
  <form className="panel question-search-form" onSubmit={event=>{event.preventDefault();if(chosen)change({...choice,resultQuestionId:chosen.id});}}>
   <label>年份<select aria-label="搜题年份" value={choice.year} onChange={event=>change(changeSearchYear(choice,bank,event.target.value))}><option value="">选择年份</option>{years.map(year=><option key={year} value={year}>{year} 年</option>)}</select></label>
   {subject==='cs'&&<label>考试季<select aria-label="搜题考试季" disabled={!choice.year} value={selectedSeason} onChange={e=>{setCSSeason(e.target.value);change({...choice,paperId:'',questionId:'',resultQuestionId:''});}}><option value="">选择考试季</option>{[...new Set(inYear.map(p=>p.examSeries))].map(season=><option key={season} value={season}>{season==='s'?'May/June':season==='w'?'Oct/Nov':'Feb/March'}</option>)}</select></label>}
   <label>{subject==='cs'?'卷号':math?'月份':'Section'}<select aria-label={subject==='cs'?'搜题卷号':math?'搜题月份':'搜题 Section'} disabled={!choice.year} value={choice.paperId} onChange={event=>change(changeSearchPaper(choice,bank,bank.find(p=>p.id===event.target.value)))}><option value="">{subject==='cs'?'选择卷号':math?'选择月份':'选择 Section'}</option>{inYear.filter(p=>subject!=='cs'||p.examSeries===selectedSeason).map(p=><option key={p.id} value={p.id}>{subject==='cs'?`${p.syllabusCode}/${p.variant}`:math?`${p.month} 月${inYear.filter(x=>x.month===p.month).length>1?` · ${p.variant?`${p.variant} 卷`:subject==='s2'?'常规卷':p.specification==='old'?'旧版':'新版'}`:''}`:`Section ${p.section}`}</option>)}</select></label>
   <label>题号<select aria-label="搜题题号" disabled={!paper} value={choice.questionId} onChange={event=>change({...choice,questionId:event.target.value,resultQuestionId:''})}><option value="">选择题号</option>{paper?.questions.map(q=><option key={q.id} value={q.id}>第 {q.number} 题</option>)}</select></label>
   <button className="primary" type="submit" disabled={!chosen}><Search size={16}/>查看题目</button>
  </form>
  {!question||!paper?<section className="panel empty"><FileText size={30}/><h3>选择一道题，重新梳理思路。</h3><p>所有选项均来自对应年份、场次的原卷。</p></section>:<div className="search-result" key={question.id}>
   <div className="search-result-heading"><div><h2>{paper.year} · {paperPart(paper)} · 第 {question.number} 题</h2><p>满分 {question.maxScore} 分</p></div><div className="button-row">{mistake?<button className="secondary" onClick={()=>openMistake(mistake)}><Bookmark size={16}/>查看错题详情</button>:<button className="secondary" disabled={adding} onClick={async()=>{setAdding(true);setAddError('');try{setAdded(await addMistake(paper,question.id));}catch(e){setAddError(e instanceof Error?e.message:'收录失败，请重试');}finally{setAdding(false);}}}><Bookmark size={16}/>{adding?'正在加入…':'加入错题本'}</button>}</div></div>
   {addError&&<p className="field-error" role="alert">{addError}</p>}
   {subject==='cs'&&<CSReference paper={paper}/>}<section className="panel search-question"><div className="panel-heading"><h2>题目</h2><span>{question.maxScore} 分</span></div><Crops crops={question.prompt} label={`搜题 · 第 ${question.number} 题题目`}/></section>
   <section className="panel answer-panel search-answer"><div className="panel-heading"><h2>标准答案与评分细则</h2></div>{question.answer.length?<Crops crops={question.answer} label={`搜题 · 第 ${question.number} 题答案`}/>:<p className="info">这道题的标准答案尚未补齐，可以先查看题目和做题记录。</p>}{!!paper.markingNotes?.length&&<div className="general-notes"><button className="text-button" onClick={()=>setShowNotes(!showNotes)}>{showNotes?'收起':'查看'}原卷评分补充说明（跨题通用）</button>{showNotes&&<Crops crops={paper.markingNotes} label="原卷评分补充说明"/>}</div>}</section>
   <section className="panel search-attempts"><div className="panel-heading"><h2>我的做题记录</h2><span>{attempts.length} 次训练</span></div>
    {!attempts.length&&<p className="muted">暂无做题记录</p>}
    {attempts.map(s=>{
     const grade=s.grades[question.id],included=mistake?.sessionIds.includes(s.id)??false;
     return <article className="search-attempt" key={s.id} data-session-id={s.id}><div className="search-attempt-heading"><strong>{timestamp(s.startedAt)}</strong><span className={`status ${s.completedAt?'completed':''}`}>{s.completedAt?'已完成':s.submittedAt?'待批改':'进行中'}</span></div>
      <div className="search-attempt-meta"><span>整场训练用时：{s.submittedAt?duration(elapsed(s)):'计时中'}</span><span>本题得分：{grade&&validScore(grade.score,question.maxScore)?`${grade.score} / ${question.maxScore} 分`:'待评分'}</span><span>{included?'本次已加入错题本':'本次未加入错题本'}</span></div>
      {grade?.note&&<p className="search-attempt-note">{grade.note}</p>}
      <details className="search-process"><summary>查看本次解答与更正过程</summary>{subject==='cs'&&<CSAnswers sessionId={s.id} question={question} readonly/>}{(['work','correction'] as const).map(kind=>{const matching=attemptEntries(entries,s.id).filter(e=>e.kind===kind);return <div className="search-process-kind" key={kind}><h3>{kind==='work'?'我的解答过程':'更正过程'}</h3>{matching.length?matching.map(e=><ReadOnlyEntry key={e.id} entry={e} photos={photos.filter(p=>p.entryId===e.id)}/>):<p className="muted">{media.loading?'正在读取…':media.error?'暂时无法读取过程记录。':'暂无图片或说明，可稍后在错题本补充。'}</p>}</div>;})}</details>
      <button className="text-button" onClick={()=>openSession(s)}>查看整场训练<ArrowUpRight size={15}/></button>
     </article>;
    })}
    {media.error&&<div className="field-error" role="alert">过程记录读取失败：{media.error}<button className="text-button" onClick={()=>setReload(x=>x+1)}>重新读取</button></div>}
   </section>
   {!!later.length&&<section className="panel search-later"><div className="panel-heading"><h2>后续解答与订正</h2><span>独立于某次训练</span></div>{[...later].reverse().map(e=><ReadOnlyEntry key={e.id} entry={e} photos={photos.filter(p=>p.entryId===e.id)}/>)}</section>}
   {!!old.length&&<section className="panel search-legacy"><h2>相关旧版整卷记录</h2><p className="muted">以下保留原整卷记录，不计入本题训练次数，也不把整卷得分分摊到本题。</p>{old.map(s=><button className="text-button" key={s.id} onClick={()=>openSession(s)}>{timestamp(s.startedAt)} · 查看旧版整卷记录<ArrowUpRight size={15}/></button>)}</section>}
  </div>}
 </div>;
}

function ReadOnlyEntry({entry,photos}:{entry:Entry;photos:Photo[]}){
 return <div className="search-entry"><p className="timeline-label">{timestamp(entry.createdAt)} · {entry.kind==='work'?'我的解答过程':'更正过程'}</p>{entry.note&&<p className="search-attempt-note">{entry.note}</p>}{photos.length?<div className="photo-grid">{[...photos].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map(photo=><ReadOnlyPhoto key={photo.id} photo={photo}/>)}</div>:<p className="muted">暂无图片</p>}</div>;
}
function ReadOnlyPhoto({photo}:{photo:Photo}){
 const [url,setUrl]=useState(''),[zoom,setZoom]=useState(false);
 useEffect(()=>{const value=URL.createObjectURL(photo.blob);setUrl(value);return()=>URL.revokeObjectURL(value);},[photo.blob]);
 return <div className="photo-tile"><button className="photo-preview" onClick={()=>setZoom(true)} aria-label={`预览 ${photo.name}`}>{url&&<img loading="lazy" src={url} alt={photo.name} style={{transform:`rotate(${photo.rotation}deg)`}}/>}</button><div className="photo-caption"><span title={photo.name}>{photo.name}</span></div>{zoom&&<Modal title={photo.name} close={()=>setZoom(false)}><div className="photo-zoom"><img src={url} alt={photo.name} style={{transform:`rotate(${photo.rotation}deg)`}}/></div></Modal>}</div>;
}
