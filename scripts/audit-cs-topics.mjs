import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const bank=JSON.parse(await readFile('public/cs-bank.json','utf8')),index=JSON.parse(await readFile('public/cs-topics.json','utf8')),review=JSON.parse(await readFile('scripts/cs-topic-review.json','utf8'));
const prior=spawnSync('git',['show','HEAD:public/cs-bank.json'],{encoding:'utf8'});assert.equal(prior.status,0);assert.deepEqual(bank,JSON.parse(prior.stdout),'Original bank must remain unchanged');
assert.equal(bank.length,39);assert.equal(index.questions.length,283);assert.equal(review.questions.length,283);assert.equal(new Set(index.questions.map(r=>r.questionId)).size,283);
const byCategory={},byYear={},papers=[],csv=['paperId,questionId,number,maxScore,primary,related,parts,QP_pages,MS_pages,status'];let images=0;
for(const p of bank){
 assert.equal(p.questions.reduce((n,q)=>n+q.maxScore,0),75);byYear[p.year]??={papers:0,questions:0,trainable:0};byYear[p.year].papers++;
 for(const q of p.questions){
  const r=index.questions.find(r=>r.paperId===p.id&&r.questionId===q.id),a=review.questions.find(r=>r.questionId===q.id);assert(r);assert(a);for(const k of ['primary','related','tags'])assert.deepEqual(r[k],a[k]);
  assert.deepEqual(a.parts,q.parts);assert.equal(a.maxScore,q.maxScore);assert.equal(a.questionSource,q.source);assert.equal(a.answerSource,q.answerSource);
  assert(q.prompt.length>0);if(p.ready)assert(q.answer.length>0);else assert.equal(a.status,'QP_OCR_classified_MS_missing');
  byCategory[r.primary]=(byCategory[r.primary]??0)+1;byYear[p.year].questions++;if(p.ready)byYear[p.year].trainable++;
  for(const c of [...q.prompt,...q.answer]){assert(c.src.startsWith('/cs/'));assert((await stat('public'+c.src)).size>0);images++;}
  csv.push([p.id,q.id,q.number,q.maxScore,r.primary,r.related.join(';'),q.parts.join(';'),a.promptPages.join(';'),a.answerPages.join(';'),a.status].join(','));
 }
 papers.push({id:p.id,questions:p.questions.length,ready:p.ready,note:p.note??'',sources:[...new Set(p.questions.map(q=>q.source))]});
}
const report={passed:true,totalPapers:39,totalQuestions:283,trainable:bank.filter(p=>p.ready).reduce((n,p)=>n+p.questions.length,0),pending:bank.filter(p=>!p.ready).map(p=>({paperId:p.id,count:p.questions.length,reason:p.note})),byCategory,byYear,papers,imagesVerified:images,originalBankUnchanged:true};
await mkdir('output/cs-topics',{recursive:true});await writeFile('output/cs-topics/audit.json',JSON.stringify(report,null,2));await writeFile('output/cs-topics/question-checklist.csv','\ufeff'+csv.join('\r\n'));console.log(JSON.stringify({...report,papers:undefined},null,2));
