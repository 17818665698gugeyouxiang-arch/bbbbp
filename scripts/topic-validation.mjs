// Shared server-side envelope validation; the client also checks against the full bank.
const types=new Set(['complex','quadratic-roots','series','matrices','coordinates','numerical','induction']);
const csTypes=new Set(['cs-development','cs-expressions','cs-control','cs-arrays','cs-subprograms','cs-files','cs-search-sort','cs-adt','cs-testing']);
export function validTopicRecord(a){
 const time=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
 if(!a||!['fp1-topics','cs-topics'].includes(a.kind)||typeof a.id!=='string'||!a.id||a.id.length>500||!Array.isArray(a.years)||!a.years.length||!a.years.every(y=>Number.isInteger(y)&&y>=2014&&y<=2100)||!Array.isArray(a.topics)||!a.topics.length||!a.topics.every(t=>(a.kind==='cs-topics'?csTypes:types).has(t)))return false;
 if(!Array.isArray(a.refs)||!a.refs.length||a.refs.length>1000||!Array.isArray(a.questionIds)||a.refs.length!==a.questionIds.length||new Set(a.questionIds).size!==a.questionIds.length)return false;
 if(a.refs.some((r,i)=>!r||!(a.kind==='cs-topics'?/^cs-(9608|9618)-20\d{2}-[swm]-2[123]$/:/^fp1-\d{4}-(01|06|10)-(old|new)$/).test(r.paperId)||!new RegExp('^'+r.paperId+'-q[1-9][0-9]*$').test(r.questionId)||a.questionIds[i]!==r.questionId||!a.years.includes(Number(a.kind==='cs-topics'?r.paperId.split('-')[2]:r.paperId.slice(4,8)))))return false;
 if(!time(a.startedAt)||!time(a.updatedAt)||a.updatedAt<a.startedAt||!Number.isInteger(a.position)||a.position<0||a.position>=a.refs.length||!Number.isInteger(a.markingPosition)||a.markingPosition<0||a.markingPosition>=a.refs.length||!Array.isArray(a.done)||a.done.some(id=>!a.questionIds.includes(id))||!a.grades||typeof a.grades!=='object'||Array.isArray(a.grades))return false;
 if(a.submittedAt!==undefined&&(!time(a.submittedAt)||a.submittedAt<a.startedAt)||a.completedAt!==undefined&&(!a.submittedAt||!time(a.completedAt)||a.completedAt<a.submittedAt))return false;
 if(Object.entries(a.grades).some(([id,g])=>!a.questionIds.includes(id)||!g||typeof g.score!=='string'||g.score.length>100||typeof g.wrong!=='boolean'||typeof g.note!=='string'))return false;
 if(a.completedAt&&a.questionIds.some(id=>!a.grades[id]?.score?.trim()||!Number.isFinite(Number(a.grades[id].score))||Number(a.grades[id].score)<0))return false;
 return true;
}
