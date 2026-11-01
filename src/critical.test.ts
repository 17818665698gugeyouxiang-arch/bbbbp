import 'fake-indexeddb/auto';
import {describe,it,expect,vi} from 'vitest';
import JSZip from 'jszip';
import {binomialNs,probabilities,criticalSolution,generateCritical,usableQuestion,checkCritical,validCriticalAttempt,tableSource,type CriticalQuestion} from './critical';
import {StudyDB,startCritical,submitCritical,exportBackup,restoreBackup} from './db';
const q:CriticalQuestion={distribution:'binomial',n:20,p:.3,sig:.05,rule:'normal',tail:'upper'};
describe('Critical regions',()=>{
 it('respects all 24 manually selected combinations',()=>{for(const distribution of ['binomial','poisson'] as const)for(const rule of ['normal','closest'] as const)for(const tail of ['lower','upper','two'] as const)for(const sig of [.05,.1]){const q=generateCritical(distribution,rule,()=>.4,{tail,sig});expect(q).toMatchObject({distribution,rule,tail,sig});expect(usableQuestion(q)).toBe(true);}});
 it('uses exact probabilities and inclusive upper/lower boundaries',()=>{
  const s=criticalSolution(q);expect(s.upper).toEqual([10]);expect(s.upperProb(10)).toBeCloseTo(.0479618973,8);expect(s.upperProb(9)).toBeGreaterThan(.05);
  expect(checkCritical(q,'','10')).toBe(true);expect(checkCritical(q,'','9')).toBe(false);
  const lower=criticalSolution({...q,tail:'lower'});expect(lower.lower).toEqual([2]);expect(lower.lowerProb(2)).toBeLessThan(.05);expect(lower.lowerProb(3)).toBeGreaterThan(.05);
 });
 it('closest may exceed target, two-tail uses half sig independently',()=>{
  const p:CriticalQuestion={distribution:'poisson',lambda:5,rule:'closest',tail:'upper',sig:.05};const s=criticalSolution(p);expect(s.upper).toEqual([9]);expect(s.upperProb(9)).toBeGreaterThan(.05);
  const two=criticalSolution({...q,tail:'two',sig:.1});expect(two.target).toBe(.05);expect(two.lower).toEqual([2]);expect(two.upper).toEqual([10]);
  expect(checkCritical({...q,tail:'two',sig:.1},'2','10')).toBe(true);
 });
 it('rejects empty closest regions rather than choosing a very large tail',()=>{expect(usableQuestion({...q,n:5,p:.05,tail:'lower',rule:'closest'})).toBe(false);});
 it('accepts both exactly tied closest boundaries',()=>{const tied={...q,n:1,p:.5,sig:.75,tail:'lower' as const,rule:'closest' as const};expect(criticalSolution(tied).lower).toEqual([0,1]);expect(checkCritical(tied,'0','')).toBe(true);expect(checkCritical(tied,'1','')).toBe(true);});
 it('covers every table n and all generated combinations stay table-readable',()=>{
  let state=1234567;const rng=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/2**32;};const seen=new Set<string>();
  for(const distribution of ['binomial','poisson'] as const)for(const rule of ['normal','closest'] as const)for(let i=0;i<300;i++){
   const a=generateCritical(distribution,rule,rng),s=criticalSolution(a);seen.add(`${distribution}:${rule}:${a.tail}:${a.sig}`);expect(usableQuestion(a)).toBe(true);expect(probabilities(a).reduce((x,y)=>x+y,0)).toBeCloseTo(1,10);
   expect(checkCritical(a,String(s.lower[0]??''),String(s.upper[0]??''))).toBe(true);
   if(distribution==='poisson')expect(Math.max(...s.upper,0)-1).toBeLessThanOrEqual(a.lambda!<=5?19:22);
  }
  expect(seen.size).toBe(24);expect(new Set(binomialNs.map(n=>tableSource({...q,n})))).toHaveLength(5);
 });
 it('preserves pending attempts, drafts, fixed results, and ZIP old/new compatibility',async()=>{
  const a=new StudyDB(crypto.randomUUID()),b=new StudyDB(crypto.randomUUID());try{
   const first=await startCritical('binomial','normal',a);expect((await startCritical('poisson','closest',a)).id).toBe(first.id);
   const s=criticalSolution(first.question),lower=String(s.lower[0]??''),upper=String(s.upper[0]??'');
   await a.criticalAttempts.update(first.id,{lower,upper});await restoreBackup(await exportBackup(a),[],b);expect((await b.criticalAttempts.get(first.id))!.lower).toBe(lower);
   const fail=vi.spyOn(a.criticalAttempts,'put').mockRejectedValueOnce(Error('storage full'));await expect(submitCritical(first.id,lower,upper,a)).rejects.toThrow('storage full');fail.mockRestore();expect((await a.criticalAttempts.get(first.id))!.submittedAt).toBeUndefined();
   const done=await submitCritical(first.id,lower,upper,a);expect(done.correct).toBe(true);expect(validCriticalAttempt(done)).toBe(true);
   expect(await submitCritical(first.id,'0','0',a)).toEqual(done);
   await restoreBackup(await exportBackup(a),[],b);expect((await b.criticalAttempts.get(first.id))!.correct).toBe(true);
   const old=new JSZip();old.file('backup.json',JSON.stringify({format:'bpho-study',version:1,sessions:[],mistakes:[],entries:[],photos:[]}));await restoreBackup(new Blob([await old.generateAsync({type:'uint8array'})]),[],b);expect(await b.criticalAttempts.count()).toBe(1);
   expect((await startCritical('poisson','closest',a)).id).not.toBe(first.id);
   await expect(submitCritical((await a.criticalAttempts.toArray()).find(x=>!x.submittedAt)!.id,'-1','',a)).rejects.toThrow();
  }finally{await a.delete();await b.delete();}
 });
 it('rejects forged results and invalid question parameters',()=>{const a={id:'a',question:q,startedAt:1,updatedAt:2,submittedAt:2,lower:'',upper:'9',correct:true};expect(validCriticalAttempt(a)).toBe(false);expect(validCriticalAttempt({...a,question:{...q,p:.99}})).toBe(false);});
});
