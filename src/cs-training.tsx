import {useEffect,useState} from 'react';
import {db} from './db';
import {type Paper,type Session,duration,elapsed} from './model';
import {Crops,Modal} from './media';
import {CSAnswers,CSReference,flushCSAnswers} from './cs-answers';
export function CSTraining({session:s,paper,busy,run,refresh,submit,updateSession,originalPapers}:{session:Session;paper:Paper;busy:boolean;run:(fn:()=>Promise<void>)=>Promise<void>;refresh:()=>void;submit:()=>Promise<void>;updateSession?:(patch:Partial<Session>)=>Promise<void>;originalPapers?:Record<string,Paper>}){
 const [now,setNow]=useState(Date.now()),[confirm,setConfirm]=useState(false),[missing,setMissing]=useState<string[]>([]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const questions=s.questionIds.map(id=>paper.questions.find(q=>q.id===id)!),q=questions[s.position];
 const persist=updateSession??(async(patch:Partial<Session>)=>{await db.sessions.update(s.id,patch);});
 const move=(position:number)=>run(async()=>{await flushCSAnswers();await persist({position,updatedAt:Date.now()});refresh();window.scrollTo(0,0);});
 const checkSubmit=()=>run(async()=>{await flushCSAnswers();const answers=await db.csAnswers.where('sessionId').equals(s.id).toArray(),photoIds=new Set((await db.csAnswerPhotos.toArray()).map(p=>p.entryId));setMissing(questions.filter(q=>!s.done.includes(q.id)&&!answers.some(a=>a.questionId===q.id&&(a.text.trim()||photoIds.has(a.id)))).map(q=>q.number));setConfirm(true);});
 return <><div className="work-heading"><div><h1>{paper.title}</h1></div><span className="timer">{duration(elapsed(s,now))}</span></div><div className="training-bar"><span>文字、伪代码与纸上图片均可作答 · 整卷交卷后显示 MS</span><CSReference paper={originalPapers?.[q.id]??paper}/></div>
 <nav className="cs-training-nav" aria-label="计算机题号">{questions.map((question,i)=><button disabled={busy} className={i===s.position?'current':''} key={question.id} onClick={()=>move(i)}>第 {question.number} 题 {s.done.includes(question.id)?'已完成':`${question.maxScore} 分`}</button>)}</nav>
 <div className="cs-training-grid"><section className="panel question-panel"><div className="panel-heading"><h2>第 {q.number} 题{!paper.year&&<small className="topic-source">{q.title}</small>}</h2><span>{q.maxScore} 分</span></div><Crops crops={q.prompt} label={`第 ${q.number} 题`}/></section><CSAnswers key={q.id} sessionId={s.id} question={q}/></div>
 <div className="training-actions"><button className="secondary" disabled={busy} onClick={()=>run(async()=>{await flushCSAnswers();await persist({done:s.done.includes(q.id)?s.done.filter(id=>id!==q.id):[...s.done,q.id],updatedAt:Date.now()});})}>{s.done.includes(q.id)?'已标记完成':'标记本题完成'}</button><div><button className="secondary" disabled={busy||s.position===0} onClick={()=>move(s.position-1)}>上一题</button> <button className="secondary" disabled={busy||s.position===questions.length-1} onClick={()=>move(s.position+1)}>下一题</button></div></div>
 <div className="submit-row"><span>纸上作答可标记完成，图片也可在批改后补充。</span><button className="primary" disabled={busy} onClick={checkSubmit}>整场交卷</button></div>
 {confirm&&<Modal title="确认提交本场训练？" close={()=>setConfirm(false)}><p>交卷后固定用时，原始作答保存为只读，开始逐大题自评。</p>{missing.length>0&&<p className="info">第 {missing.join('、')} 题尚无输入或图片，也未标记完成；仍可交卷。</p>}<div className="button-row"><button className="secondary" onClick={()=>setConfirm(false)}>继续作答</button><button className="primary" disabled={busy} onClick={()=>run(async()=>{await flushCSAnswers();await submit();})}>确认交卷</button></div></Modal>}</>;
}
