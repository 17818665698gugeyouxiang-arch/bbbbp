import {db,type StudyDB,mistakeId} from './db';
import {type Paper,type Grade,uid,validScore} from './model';
import {type TopicAttempt,type TopicRef,type TopicId,validTopicAttempt,resolveTopic} from './topics';

export async function startTopic(refs:TopicRef[],years:number[],topics:TopicId[],papers:Paper[],store:StudyDB=db){
 const now=Date.now(),a:TopicAttempt={id:uid(),kind:refs[0]&&papers.find(p=>p.id===refs[0].paperId)?.subject==='cs'?'cs-topics':'fp1-topics',years:[...years],topics:[...topics],refs:refs.map(r=>({...r})),questionIds:refs.map(r=>r.questionId),startedAt:now,updatedAt:now,position:0,markingPosition:0,done:[],grades:{}};
 if(!validTopicAttempt(a,papers))throw Error('请选择有效的年份、题型及完整大题。');
 return store.transaction('rw',[store.sessions,store.topicAttempts],async()=>{
  if((await store.sessions.toArray()).some(s=>!s.submittedAt&&!s.archived)||(await store.topicAttempts.toArray()).some(s=>!s.submittedAt))throw Error('已有未交卷训练，请先继续并交卷。');
  await store.topicAttempts.add(a);return a;
 });
}
export async function updateTopic(id:string,patch:Partial<Pick<TopicAttempt,'position'|'markingPosition'|'done'|'grades'|'completedAt'>>,store:StudyDB=db){
 await store.transaction('rw',store.topicAttempts,async()=>{
  const a=await store.topicAttempts.get(id);if(!a)throw Error('专项记录不存在。');
  const next={...a,...patch,updatedAt:Date.now()};if(!validTopicAttempt(next))throw Error('专项进度无效。');await store.topicAttempts.put(next);
 });
}
export async function submitTopic(id:string,store:StudyDB=db){
 await store.transaction('rw',store.topicAttempts,async()=>{const a=await store.topicAttempts.get(id);if(!a)throw Error('专项记录不存在。');if(a.submittedAt)return;await store.topicAttempts.put({...a,submittedAt:Date.now(),updatedAt:Date.now(),markingPosition:0});});
}
export async function draftTopicGrade(id:string,questionId:string,change:Partial<Grade>,store:StudyDB=db){
 return store.transaction('rw',store.topicAttempts,async()=>{
  const a=await store.topicAttempts.get(id);if(!a?.submittedAt||!a.questionIds.includes(questionId))throw Error('专项尚未交卷或题目无效。');
  const grade={...(a.grades[questionId]??{score:'',wrong:false,note:''}),...change};
  await store.topicAttempts.put({...a,grades:{...a.grades,[questionId]:grade},completedAt:undefined,updatedAt:Date.now()});return grade;
 });
}
export async function saveTopicGrade(id:string,questionId:string,grade:Grade,next:number,finish:boolean,papers:Paper[],store:StudyDB=db){
 return store.transaction('rw',[store.topicAttempts,store.mistakes],async()=>{
  const a=await store.topicAttempts.get(id),ref=a?.refs.find(r=>r.questionId===questionId);if(!a?.submittedAt||!ref)throw Error('专项尚未交卷或题目无效。');
  const {question}=resolveTopic(ref,papers);if(!validScore(grade.score,question.maxScore))throw Error(`请输入 0 至 ${question.maxScore} 的有效得分。`);
  const updated={...a,grades:{...a.grades,[questionId]:grade},markingPosition:next,updatedAt:Date.now()};
  if(finish){if(a.refs.some(r=>!validScore(updated.grades[r.questionId]?.score??'',resolveTopic(r,papers).question.maxScore)))throw Error('请先完成所有题目的评分。');updated.completedAt=Date.now();}
  if(!validTopicAttempt(updated,papers))throw Error('专项批改位置无效。');
  const mid=mistakeId(questionId),existing=await store.mistakes.get(mid);
  if(grade.wrong)await store.mistakes.put({...existing,id:mid,paperId:ref.paperId,questionId,sessionIds:[...new Set([...(existing?.sessionIds??[]),id])],mastered:existing?.mastered??false,createdAt:existing?.createdAt??Date.now(),updatedAt:Date.now()});
  else if(existing)await store.mistakes.put({...existing,sessionIds:existing.sessionIds.filter(x=>x!==id),updatedAt:Date.now()});
  await store.topicAttempts.put(updated);return updated;
 });
}
