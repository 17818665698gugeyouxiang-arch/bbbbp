import 'fake-indexeddb/auto';
import {it,expect,vi} from 'vitest';
import {StudyDB,startSession,exportBackup,restoreBackup,saveGrade,mistakeId} from './db';
import {saveCSAnswer,uploadCSPhotos} from './cs-answers';
import {type Paper,paperPart} from './model';
const paper:Paper={id:'cs-9618-2025-s-21',subject:'cs',year:2025,examSeries:'s',syllabusCode:'9618',variant:'21',month:6,title:'CS',instructions:'',scoreCap:75,choose:1,ready:true,cover:[],questions:[{id:'cs-q1',number:'1',title:'1',maxScore:75,source:'qp',answerSource:'ms',prompt:[],answer:[],parts:['1(a)','1(b)(i)']}]};
it('keeps code whitespace, subparts and images separate from mistakes; ZIP/scores survive; submitted originals cannot change',async()=>{
 const a=new StudyDB(crypto.randomUUID()),b=new StudyDB(crypto.randomUUID());try{
  expect(paperPart(paper)).toContain('May/June · 9618/21');const s=await startSession(paper,['cs-q1'],a);
  await saveCSAnswer(s.id,'cs-q1','1(a)','IF x THEN\n    OUTPUT x\nENDIF',a);await saveCSAnswer(s.id,'cs-q1','1(b)(i)','trace table',a);
  await uploadCSPhotos(s.id,'cs-q1','1(a)',[new File(['image-bytes'],'work.png',{type:'image/png'})],a);
  expect(await a.mistakes.count()).toBe(0);expect(await a.csAnswerPhotos.count()).toBe(1);
  const spy=vi.spyOn(a.csAnswers,'put').mockRejectedValueOnce(Error('quota'));await expect(saveCSAnswer(s.id,'cs-q1','1(a)','failed',a)).rejects.toThrow('quota');spy.mockRestore();expect((await a.csAnswers.toArray())[0].text).toContain('    OUTPUT');
  await a.sessions.update(s.id,{submittedAt:Date.now()});await expect(saveCSAnswer(s.id,'cs-q1','1(a)','overwrite',a)).rejects.toThrow('已交卷');await expect(uploadCSPhotos(s.id,'cs-q1','1(a)',[],a)).rejects.toThrow('已交卷');
  await saveGrade(s.id,paper,'cs-q1',{score:'62.5',wrong:true,note:'review'},0,true,a);
  await restoreBackup(await exportBackup(a),[paper],b);await restoreBackup(await exportBackup(a),[paper],b);
  expect((await b.csAnswers.toArray()).find(x=>x.partId==='1(a)')?.text).toBe('IF x THEN\n    OUTPUT x\nENDIF');expect(await b.csAnswerPhotos.count()).toBe(1);expect(await (await b.csAnswerPhotos.toArray())[0].blob.text()).toBe('image-bytes');expect((await b.mistakes.get(mistakeId('cs-q1')))?.sessionIds).toEqual([s.id]);
 }finally{await a.delete();await b.delete();}
});
