import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const catalog=JSON.parse(await readFile('src/grade-boundaries.json','utf8'));
const report={checkedAt:catalog.checkedAt,subjects:{},papers:[]};
const ids=new Set();
for(const [subject,name] of Object.entries({bpho:'bank',fp1:'fp1-bank',s2:'s2-bank',cs:'cs-bank'})){
 const papers=JSON.parse(await readFile(`public/${name}.json`,'utf8')),counts={verified:0,reference:0,unavailable:0};
 for(const p of papers){
  assert(!ids.has(p.id));ids.add(p.id);
  const r=catalog.records.find(r=>r.paperId===p.id);assert(r,p.id);assert(r.sources.length,p.id);counts[r.status]++;
  if(r.status==='unavailable')assert(!r.target,p.id);
  else assert(r.target.score>0&&r.target.score<=r.maxScore,p.id);
  if(r.scope==='paper')assert.equal(r.maxScore,p.scoreCap,p.id);
  else assert.equal(r.maxScore,papers.filter(other=>other.year===p.year).reduce((n,p)=>n+p.scoreCap,0),p.id);
  for(const s of r.sources)assert.equal(new URL(s.url).protocol,'https:');
  for(const ref of r.qualificationReferences??[]){assert(ref.components.includes(p.variant));assert.equal(ref.maxScore,300);}
  report.papers.push({paperId:p.id,status:r.status,target:r.target??null,scope:r.scope,maxScore:r.maxScore,sources:r.sources,note:r.note});
 }
 report.subjects[subject]={total:papers.length,...counts};
}
assert.equal(catalog.records.length,ids.size);
await mkdir('output/boundaries',{recursive:true});await writeFile('output/boundaries/audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.subjects,null,2));
