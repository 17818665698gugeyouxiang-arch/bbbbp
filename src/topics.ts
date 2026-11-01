import {type Paper,type Session,type Grade,paperPart,validScore} from './model';

export const topicNames={complex:'复数','quadratic-roots':'二次方程根的关系',series:'数列与求和',matrices:'矩阵与线性变换',coordinates:'坐标几何',numerical:'数值方法',induction:'数学归纳法'} as const;
export type TopicId=keyof typeof topicNames;
export type TopicRef={paperId:string;questionId:string};
export type TopicRow=TopicRef&{primary:TopicId;related:TopicId[];tags:string[]};
export type TopicIndex={version:1;questions:TopicRow[]};
export type TopicAttempt=Omit<Session,'paperId'|'archived'>&{kind:'fp1-topics';years:number[];topics:TopicId[];refs:TopicRef[]};
export const isTopicId=(s:unknown):s is TopicId=>typeof s==='string'&&Object.hasOwn(topicNames,s);
export function resolveTopic(ref:TopicRef,papers:Paper[]){const paper=papers.find(p=>p.id===ref.paperId&&p.subject==='fp1'&&!p.legacy);const question=paper?.questions.find(q=>q.id===ref.questionId);if(!paper||!question)throw Error('专项题目资料不完整，请刷新题库后重试。');return {paper,question};}
export function filterTopics(index:TopicIndex,papers:Paper[],years:number[],topics:TopicId[]){
 const bank=new Map(papers.filter(p=>p.subject==='fp1'&&p.ready&&!p.legacy).map(p=>[p.id,p]));
 return index.questions.filter(r=>years.includes(bank.get(r.paperId)?.year??0)&&topics.some(t=>r.primary===t||r.related.includes(t)));
}
export function sampleTopics(pool:TopicRow[],count:number,random=Math.random):TopicRef[]{
 if(!Number.isInteger(count)||count<1||count>pool.length)throw Error(`大题数量应为 1 至 ${pool.length} 之间的整数。`);
 const unique=[...new Map(pool.map(r=>[r.questionId,r])).values()];if(unique.length!==pool.length)throw Error('题库出现重复题目，请重新加载。');
 for(let i=0;i<count;i++){const j=i+Math.floor(random()*(unique.length-i));[unique[i],unique[j]]=[unique[j],unique[i]];}
 return unique.slice(0,count).map(({paperId,questionId})=>({paperId,questionId}));
}
export function validateTopicIndex(index:TopicIndex,papers:Paper[]){
 const questions=papers.filter(p=>p.subject==='fp1'&&!p.legacy).flatMap(p=>p.questions);
 if(index.version!==1||index.questions.length!==questions.length||new Set(index.questions.map(r=>r.questionId)).size!==questions.length)throw Error('分类题库不完整，请重新加载。');
 for(const row of index.questions){resolveTopic(row,papers);if(!isTopicId(row.primary)||!Array.isArray(row.related)||!row.related.every(isTopicId)||!Array.isArray(row.tags)||!row.tags.every(t=>typeof t==='string'))throw Error('分类信息无效。');}
}
export function validTopicAttempt(a:TopicAttempt,papers?:Paper[]):boolean{
 try{
  if(!a||a.kind!=='fp1-topics'||typeof a.id!=='string'||!a.id||a.id.length>500||!Array.isArray(a.years)||!a.years.length||!a.years.every(y=>Number.isInteger(y)&&y>=2014&&y<=2100)||!Array.isArray(a.topics)||!a.topics.length||!a.topics.every(isTopicId))return false;
  if(!Array.isArray(a.refs)||!a.refs.length||a.refs.length>1000||!Array.isArray(a.questionIds)||a.refs.length!==a.questionIds.length||new Set(a.questionIds).size!==a.questionIds.length)return false;
  if(a.refs.some((r,i)=>typeof r.paperId!=='string'||typeof r.questionId!=='string'||a.questionIds[i]!==r.questionId))return false;
  if(!Number.isFinite(a.startedAt)||a.startedAt<=0||!Number.isFinite(a.updatedAt)||a.updatedAt<a.startedAt||!Number.isInteger(a.position)||a.position<0||a.position>=a.refs.length||!Number.isInteger(a.markingPosition)||a.markingPosition<0||a.markingPosition>=a.refs.length||!Array.isArray(a.done)||a.done.some(id=>!a.questionIds.includes(id))||!a.grades||typeof a.grades!=='object'||Array.isArray(a.grades))return false;
  if(a.submittedAt!==undefined&&(!Number.isFinite(a.submittedAt)||a.submittedAt<a.startedAt))return false;
  if(a.completedAt!==undefined&&(!a.submittedAt||!Number.isFinite(a.completedAt)||a.completedAt<a.submittedAt))return false;
  for(const [id,g] of Object.entries(a.grades)){if(!a.questionIds.includes(id)||!g||typeof g.score!=='string'||g.score.length>100||typeof g.wrong!=='boolean'||typeof g.note!=='string')return false;}
  if(papers){for(const r of a.refs){const {paper,question}=resolveTopic(r,papers);if(!paper.ready||!a.years.includes(paper.year))return false;if(a.completedAt&&!validScore(a.grades[question.id]?.score??'',question.maxScore))return false;}}
  return true;
 }catch{return false;}
}
export const topicTitle=(a:TopicAttempt)=>`FP1 专项 · ${a.topics.map(t=>topicNames[t]).join('、')}`;
// A render-only adapter: original references are persisted in topicAttempts, never as a fictitious exam.
export function topicView(a:TopicAttempt,papers:Paper[]):{session:Session;paper:Paper;originalPaperIds:Record<string,string>}{
 const resolved=a.refs.map(r=>resolveTopic(r,papers)),originalPaperIds=Object.fromEntries(a.refs.map(r=>[r.questionId,r.paperId]));
 return {session:{...a,paperId:'fp1-topic-view'},originalPaperIds,paper:{id:'fp1-topic-view',subject:'fp1',year:0,title:topicTitle(a),instructions:'在纸上完成作答，整场交卷后逐题批改。',choose:a.refs.length,scoreCap:resolved.reduce((n,r)=>n+r.question.maxScore,0),cover:[],ready:true,questions:resolved.map(({paper,question},i)=>({...question,number:String(i+1),title:`${paper.year} · ${paperPart(paper)} · 原卷第 ${question.number} 题`}))}};
}
export type TopicGrade=Grade;
