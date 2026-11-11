import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import raw from '../public/ukcho-bank.json';
import {type Paper,paperPart,result} from './model';
import {assetTree} from './site-config';
import {boundaryFor} from './grade-boundaries';
import {changeSearchYear} from './search-model';
import {StudyDB,startSession,saveGrade,ensureEntry,addPhotos,exportBackup,restoreBackup,mistakeId} from './db';
const bank=raw as Paper[];
it('13 年 69 道完整大题、图片与官方模板引用有效，分数逐题合计一致',()=>{
 expect(bank.map(p=>p.year)).toEqual(Array.from({length:13},(_,i)=>2014+i));expect(bank.flatMap(p=>p.questions)).toHaveLength(69);
 for(const p of bank){expect(p.choose).toBe(p.questions.length);expect(p.scoreCap).toBe(p.questions.reduce((n,q)=>n+q.maxScore,0));expect(p.ready).toBe(true);expect(paperPart(p)).toBe('Round 1');
  expect(p.questions.map(q=>q.number)).toEqual(p.questions.map((_,i)=>String(i+1)));
  for(const q of p.questions){expect(q.id).toBe(`${p.id}-q${q.number}`);expect(q.prompt.length).toBeGreaterThan(0);expect(q.answer.length).toBeGreaterThan(0);for(const c of [...q.prompt,...q.answer,...(q.templates??[])])expect(c.src).toMatch(new RegExp(`^/ukcho/${p.id}/q${q.number}/`));}
  expect(boundaryFor(p)?.maxScore).toBe(p.scoreCap);
 }
 expect(assetTree(raw)).toEqual(raw);
});
it('搜题首次选年自动选卷，换年保留实际存在的题号',()=>{
 const a=changeSearchYear({year:'',paperId:'',questionId:'',resultQuestionId:''},bank,'2026');expect(a.paperId).toBe('ukcho-2026-round1');
 const b=changeSearchYear({...a,questionId:a.paperId+'-q2',resultQuestionId:a.paperId+'-q2'},bank,'2025');expect(b.questionId).toBe('ukcho-2025-round1-q2');
 const c=changeSearchYear({...b,questionId:b.paperId+'-q6'},bank,'2026');expect(c.questionId).toBe('');
});
it('UKChO 自评、照片与订正、重复训练及版本 1 备份可恢复且不串题',async()=>{
 const a=new StudyDB(crypto.randomUUID()),b=new StudyDB(crypto.randomUUID());try{
  const p=bank.at(-1)!,q=p.questions[0],s=await startSession(p,p.questions.map(q=>q.id),a);
  await expect(startSession(bank[0],bank[0].questions.map(q=>q.id),a)).rejects.toThrow('已有');
  await a.sessions.update(s.id,{submittedAt:Date.now()});await saveGrade(s.id,p,q.id,{score:'3.5',wrong:true,note:'UKChO'},1,false,a);
  const e=await ensureEntry(q.id,p.id,s.id,'work',a);await addPhotos(e,[new File(['bytes'],'work.png',{type:'image/png'})],a);
  await a.entries.add({id:crypto.randomUUID(),mistakeId:mistakeId(q.id),kind:'correction',note:'later correction',createdAt:Date.now(),updatedAt:Date.now()});
  const repeat=await startSession(p,p.questions.map(q=>q.id),a);await a.sessions.update(repeat.id,{submittedAt:Date.now()});
  await restoreBackup(await exportBackup(a),bank,b);await restoreBackup(await exportBackup(a),bank,b);
  expect(await b.sessions.count()).toBe(2);expect(await b.mistakes.count()).toBe(1);expect(await b.entries.count()).toBe(2);expect(await (await b.photos.toArray())[0].blob.text()).toBe('bytes');
  expect(result((await b.sessions.get(s.id))!,p).score).toBe(3.5);
 }finally{await a.delete();await b.delete();}
});
