import 'fake-indexeddb/auto';
import {afterEach,describe,it,expect,vi} from 'vitest';
import JSZip from 'jszip';
import rawBank from '../public/cs-bank.json';
import rawIndex from '../public/cs-topics.json';
import fpBank from '../public/fp1-bank.json';
import {type Paper,result} from './model';
import {type TopicIndex,type TopicAttempt,csTopicNames,validateTopicIndex,filterTopics,topicView,validTopicAttempt} from './topics';
import {StudyDB,startSession,restoreBackup,exportBackup,ensureEntry,addPhotos} from './db';
import {startTopic,submitTopic,saveTopicGrade,updateTopic} from './topic-store';
import {saveCSAnswer,uploadCSPhotos} from './cs-answers';
import {validTopicRecord} from '../scripts/topic-validation.mjs';
const bank=rawBank as Paper[],index=rawIndex as TopicIndex,stores:StudyDB[]=[];
const refs=[{paperId:'cs-9618-2026-s-21',questionId:'cs-9618-2026-s-21-q9'},{paperId:'cs-9618-2025-s-21',questionId:'cs-9618-2025-s-21-q7'}];
const store=()=>{const d=new StudyDB(crypto.randomUUID());stores.push(d);return d;};
afterEach(async()=>{vi.restoreAllMocks();await Promise.all(stores.splice(0).map(d=>d.delete()));});
describe('计算机完整大题分类与专项',()=>{
 it('分类覆盖 39 套 283 道完整数字大题，包括缺答案的 25 道',()=>{
  validateTopicIndex(index,bank,'cs');expect(index.questions).toHaveLength(283);expect(bank).toHaveLength(39);
  const years=[2020,2021,2022,2023,2024,2025,2026],types=Object.keys(csTopicNames) as any;
  expect(filterTopics(index,bank,years,types,'cs',true)).toHaveLength(283);
  expect(filterTopics(index,bank,years,types,'cs')).toHaveLength(258);
  for(const p of bank)expect(p.questions.reduce((n,q)=>n+q.maxScore,0)).toBe(75);
 });
 it('原题、全部字母及罗马小问和 MS 完整引用，不复制或改变原题编号',async()=>{
  const d=store(),a=await startTopic(refs,[2025,2026],['cs-arrays'],bank,d),v=topicView(a,bank);
  expect(a.kind).toBe('cs-topics');expect(v.paper.subject).toBe('cs');expect(v.paper.year).toBe(0);
  refs.forEach((r,i)=>{const q=bank.find(p=>p.id===r.paperId)!.questions.find(q=>q.id===r.questionId)!;expect(v.paper.questions[i]).toMatchObject({id:q.id,parts:q.parts,prompt:q.prompt,answer:q.answer});});
  expect(v.originalPaperIds[refs[0].questionId]).toBe(refs[0].paperId);
  expect(validTopicRecord(a)).toBe(true);
  expect(validTopicAttempt({...a,topics:['complex']},bank)).toBe(false);
  expect(validTopicRecord({...a,kind:'fp1-topics'})).toBe(false);
 });
 it('缺答案题不能开始练习，跨科目引用不能伪装为计算机专项',async()=>{
  const d=store(),p=bank.find(p=>!p.ready)!;
  await expect(startTopic([{paperId:p.id,questionId:p.questions[0].id}],[2022],['cs-files'],bank,d)).rejects.toThrow();
  await expect(startTopic(refs,[2025,2026],['complex'],bank,d)).rejects.toThrow();
  expect(await d.topicAttempts.count()).toBe(0);
 });
 it('模考、FP1、计算机专项共用一场未交卷限制，计时持续，交卷后固定',async()=>{
  const d=store();vi.spyOn(Date,'now').mockReturnValue(1000);const a=await startTopic(refs,[2025,2026],['cs-arrays'],bank,d);
  await expect(startSession(bank[0],bank[0].questions.map(q=>q.id),d)).rejects.toThrow('未交卷专项');
  await expect(startTopic([{paperId:fpBank[0].id,questionId:fpBank[0].questions[0].id}],[2026],['complex'],fpBank as Paper[],d)).rejects.toThrow('已有');
  vi.spyOn(Date,'now').mockReturnValue(5000);await updateTopic(a.id,{position:1},d);await submitTopic(a.id,d);expect((await d.topicAttempts.get(a.id))!.submittedAt).toBe(5000);
  expect(await d.sessions.count()).toBe(0);
 });
 it('作答文本与照片独立保存，失败不丢草稿，交卷后原始作答不可修改',async()=>{
  const d=store(),a=await startTopic(refs,[2025,2026],['cs-arrays'],bank,d),q=bank.find(p=>p.id===refs[0].paperId)!.questions.find(q=>q.id===refs[0].questionId)!,part=q.parts![0];
  const text='IF x THEN\n    OUTPUT x\nENDIF';await saveCSAnswer(a.id,q.id,part,text,d);await uploadCSPhotos(a.id,q.id,part,[new File(['work-image'],'work.png',{type:'image/png'})],d);
  expect(await d.mistakes.count()).toBe(0);const fail=vi.spyOn(d.csAnswers,'put').mockRejectedValueOnce(Error('quota'));await expect(saveCSAnswer(a.id,q.id,part,'lost',d)).rejects.toThrow('quota');fail.mockRestore();expect((await d.csAnswers.toArray())[0].text).toBe(text);
  await submitTopic(a.id,d);await expect(saveCSAnswer(a.id,q.id,part,'overwrite',d)).rejects.toThrow('已交卷');
  expect(await d.csAnswerPhotos.count()).toBe(1);
 });
 it('完整往返 ZIP v1 和旧备份合并，保留作答图片、错题、订正和小数得分',async()=>{
  const d=store(),out=store(),a=await startTopic(refs,[2025,2026],['cs-arrays'],bank,d),q=bank.find(p=>p.id===refs[0].paperId)!.questions.find(q=>q.id===refs[0].questionId)!;
  await saveCSAnswer(a.id,q.id,q.parts![0],'    saved code',d);await uploadCSPhotos(a.id,q.id,q.parts![0],[new File(['original'],'original.png',{type:'image/png'})],d);await submitTopic(a.id,d);
  await saveTopicGrade(a.id,q.id,{score:'10.5',wrong:true,note:'my mistake'},1,false,bank,d);
  const entry=await ensureEntry(q.id,refs[0].paperId,a.id,'correction',d);await addPhotos(entry,[new File(['correction'],'correction.png',{type:'image/png'})],d);
  await saveTopicGrade(a.id,refs[1].questionId,{score:'12',wrong:false,note:''},1,true,bank,d);
  expect(result(topicView((await d.topicAttempts.get(a.id))!,bank).session,topicView(a,bank).paper).score).toBe(22.5);
  const zip=await exportBackup(d);await restoreBackup(zip,bank,out);await restoreBackup(zip,bank,out);
  expect(await out.csAnswers.count()).toBe(1);expect(await (await out.csAnswerPhotos.toArray())[0].blob.text()).toBe('original');expect(await (await out.photos.toArray())[0].blob.text()).toBe('correction');
  const old=new JSZip();old.file('backup.json',JSON.stringify({format:'bpho-study',version:1,sessions:[],mistakes:[],entries:[],photos:[]}));await restoreBackup(new Blob([await old.generateAsync({type:'uint8array'})]),bank,out);
  expect(await out.topicAttempts.count()).toBe(1);expect(await out.csAnswerPhotos.count()).toBe(1);expect(await out.sessions.count()).toBe(0);
 });
});
