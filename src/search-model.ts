import {type Paper,type Session,type Entry,type Subject,subjectOf} from './model';

export type SearchChoice={year:string;paperId:string;questionId:string;resultQuestionId:string};
export const emptySearch=():SearchChoice=>({year:'',paperId:'',questionId:'',resultQuestionId:''});
export function loadSearchChoices():Record<Subject,SearchChoice>{
 const all={bpho:emptySearch(),fp1:emptySearch(),s2:emptySearch(),cs:emptySearch()};
 try{const saved=JSON.parse(localStorage.getItem('study-search-choices')??'{}');for(const key of Object.keys(all) as Subject[]){const value=saved[key];if(value&&['year','paperId','questionId','resultQuestionId'].every(k=>typeof value[k]==='string'))all[key]={year:value.year,paperId:value.paperId,questionId:value.questionId,resultQuestionId:value.resultQuestionId};}}catch{}
 return all;
}
export function changeSearchPaper(choice:SearchChoice,papers:Paper[],paper?:Paper):SearchChoice{
 const previous=papers.find(p=>p.id===choice.paperId),number=previous?.questions.find(q=>q.id===choice.questionId)?.number;
 const question=number?paper?.questions.find(q=>q.number===number):undefined;
 return {year:paper?String(paper.year):choice.year,paperId:paper?.id??'',questionId:question?.id??'',resultQuestionId:choice.resultQuestionId&&question?question.id:''};
}
export function changeSearchYear(choice:SearchChoice,papers:Paper[],year:string):SearchChoice{
 const previous=papers.find(p=>p.id===choice.paperId),candidates=papers.filter(p=>String(p.year)===year&&previous&&(subjectOf(previous)==='bpho'?p.section===previous.section:p.month===previous.month));
 const next=candidates.find(p=>p.variant===previous?.variant&&p.specification===previous?.specification)??candidates.find(p=>p.variant===previous?.variant)??candidates[0];
 return {...changeSearchPaper(choice,papers,next),year};
}
export const searchablePapers=(papers:Paper[],subject:Subject)=>papers.filter(p=>!p.legacy&&subjectOf(p)===subject);
export const questionAttempts=(sessions:Session[],paperId:string,questionId:string)=>sessions
 .filter(s=>!s.archived&&s.paperId===paperId&&s.questionIds.includes(questionId))
 .sort((a,b)=>b.startedAt-a.startedAt||b.id.localeCompare(a.id));
export const legacyAttempts=(papers:Paper[],sessions:Session[],paper:Paper)=>{
 const ids=new Set(papers.filter(p=>p.legacy&&subjectOf(p)===subjectOf(paper)&&p.year===paper.year&&p.section===paper.section).map(p=>p.id));
 return sessions.filter(s=>ids.has(s.paperId)).sort((a,b)=>b.startedAt-a.startedAt);
};
export const attemptEntries=(entries:Entry[],sessionId?:string)=>entries.filter(e=>e.sessionId===sessionId)
 .sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
