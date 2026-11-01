import Dexie, { type EntityTable } from 'dexie';
import JSZip from 'jszip';
import {accountDatabaseName} from './site-config';
import {type CriticalAttempt, type CriticalQuestion,type Distribution,type CriticalRule,generateCritical,checkCritical,validCriticalAttempt} from './critical';
import { type CSAnswer,type Session, type Mistake, type Entry, type Photo, type Paper, type Grade, validScore, uid, legacyTarget } from './model';
import {type TopicAttempt,validTopicAttempt} from './topics';

export class StudyDB extends Dexie {
  sessions!: EntityTable<Session, 'id'>;
  mistakes!: EntityTable<Mistake, 'id'>;
  entries!: EntityTable<Entry, 'id'>;
  photos!: EntityTable<Photo, 'id'>;
  syncMeta!: EntityTable<{id:string;value:unknown},'id'>;
  criticalAttempts!: EntityTable<CriticalAttempt,'id'>;
  csAnswers!:EntityTable<CSAnswer,'id'>;
  csAnswerPhotos!:EntityTable<Photo,'id'>;
  topicAttempts!:EntityTable<TopicAttempt,'id'>;
  constructor(name='bpho-study-v1') { super(name); this.version(1).stores({ sessions:'id,paperId,startedAt', mistakes:'id,paperId,questionId,updatedAt', entries:'id,mistakeId,sessionId,createdAt', photos:'id,entryId' }); this.version(2).stores({syncMeta:'id'}); this.version(3).stores({criticalAttempts:'id,startedAt,updatedAt'});this.version(4).stores({csAnswers:'id,sessionId,questionId,updatedAt',csAnswerPhotos:'id,entryId'});this.version(5).stores({topicAttempts:'id,startedAt,updatedAt'}); }
}
export const db = new StudyDB(accountDatabaseName());
export async function startCritical(distribution:Distribution,rule:CriticalRule,store=db,settings:Partial<Pick<CriticalQuestion,'tail'|'sig'>>={}){
 const question=generateCritical(distribution,rule,Math.random,settings);
 return store.transaction('rw',store.criticalAttempts,async()=>{
  const active=(await store.criticalAttempts.toArray()).find(a=>!a.submittedAt);if(active)return active;
  const now=Date.now(),a:CriticalAttempt={id:uid(),question,startedAt:now,updatedAt:now,lower:'',upper:''};await store.criticalAttempts.add(a);return a;
 });
}
export async function submitCritical(id:string,lower:string,upper:string,store=db){
 return store.transaction('rw',store.criticalAttempts,async()=>{
  const a=await store.criticalAttempts.get(id);if(!a)throw Error('专项记录不存在。');if(a.submittedAt)return a;
  const integer=(s:string)=>/^\d+$/.test(s.trim())&&Number.isSafeInteger(Number(s));
  if(a.question.tail!=='upper'&&!integer(lower)||a.question.tail!=='lower'&&!integer(upper))throw Error('请填写非负整数边界。');
  const now=Date.now(),next={...a,lower,upper,submittedAt:now,updatedAt:now,correct:checkCritical(a.question,lower,upper)};await store.criticalAttempts.put(next);return next;
 });
}
export async function migrateLegacyRecords(papers:Paper[],store=db) {
  return store.transaction('rw',store.sessions,store.mistakes,async()=>{
    for(const s of await store.sessions.toArray()) {
      const target=legacyTarget(s.paperId,s.questionIds,papers);
      if(target)await store.sessions.put({...s,paperId:target.id,archived:true});
    }
    for(const m of await store.mistakes.toArray()) {
      const target=legacyTarget(m.paperId,[m.questionId],papers);
      if(target)await store.mistakes.put({...m,paperId:target.id});
    }
  });
}
export const mistakeId = (questionId: string) => `mistake:${questionId}`;
export async function addSearchMistake(paper:Paper,questionId:string,store=db){
 if(paper.legacy||!paper.questions.some(q=>q.id===questionId))throw Error('题目不存在。');
 return store.transaction('rw',store.mistakes,async()=>{
  const id=mistakeId(questionId),existing=await store.mistakes.get(id),now=Date.now();
  const mistake={...existing,id,paperId:paper.id,questionId,sessionIds:existing?.sessionIds??[],manual:true,mastered:existing?.mastered??false,createdAt:existing?.createdAt??now,updatedAt:now};
  await store.mistakes.put(mistake);return mistake;
 });
}
export function gradingEntryId(sessionId:string, questionId:string, kind:'work'|'correction') { return `${sessionId}:${questionId}:${kind}`; }
export async function startSession(paper: Paper, selected: string[], store = db) {
  if (paper.legacy || !paper.ready || selected.length !== paper.choose || new Set(selected).size !== selected.length || selected.some(id=>!paper.questions.some(q=>q.id===id))) throw new Error('请按本试卷的要求选择题目。');
  if(paper.mutuallyExclusive?.some(group=>selected.filter(id=>group.includes(id)).length>1)) throw new Error('本卷第 5 题与第 6 题不能同时选择。');
  return store.transaction('rw',[store.sessions,store.topicAttempts],async()=>{
    if((await store.topicAttempts.toArray()).some(a=>!a.submittedAt))throw Error('已有未交卷专项，请先继续并交卷。');
    const all=await store.sessions.toArray();
    if(all.some(s=>!s.submittedAt&&!s.archived)) throw new Error('已有进行中的训练，请先继续并交卷。');
    const session:Session={id:uid(),paperId:paper.id,questionIds:paper.questions.filter(q=>selected.includes(q.id)).map(q=>q.id),startedAt:Date.now(),position:0,markingPosition:0,done:[],grades:{},updatedAt:Date.now()};
    await store.sessions.add(session); return session;
  });
}
export async function saveGrade(sessionId: string, paper: Paper, questionId: string, grade: Grade, next: number, finish=false, store=db) {
  const q=paper.questions.find(q=>q.id===questionId);
  if(!q || !validScore(grade.score,q.maxScore)) throw new Error(`请输入 0–${q?.maxScore ?? 0} 的有效得分。`);
  return store.transaction('rw',store.sessions,store.mistakes,async()=>{
    const s=await store.sessions.get(sessionId);
    if(!s?.submittedAt || s.archived || paper.legacy || s.paperId!==paper.id || !s.questionIds.includes(questionId)) throw new Error('训练尚未交卷、已归档或题目无效。');
    const updated={...s,grades:{...s.grades,[questionId]:grade},markingPosition:next,updatedAt:Date.now()};
    if(finish) {
      if(s.questionIds.some(id=>!validScore(updated.grades[id]?.score??'',paper.questions.find(q=>q.id===id)!.maxScore))) throw new Error('请先完成所有题目的评分。');
      updated.completedAt=Date.now();
    }
    const id=mistakeId(questionId), existing=await store.mistakes.get(id);
    if(grade.wrong) await store.mistakes.put({...existing,id,paperId:paper.id,questionId,sessionIds:[...new Set([...(existing?.sessionIds??[]),s.id])],mastered:existing?.mastered??false,createdAt:existing?.createdAt??Date.now(),updatedAt:Date.now()});
    else if(existing) {
      // Keep earlier attempts and any photos even if this attempt is unselected.
      await store.mistakes.put({...existing,sessionIds:existing.sessionIds.filter(x=>x!==s.id),updatedAt:Date.now()});
    }
    await store.sessions.put(updated); return updated;
  });
}
export async function ensureEntry(questionId:string, paperId:string, sessionId:string, kind:'work'|'correction',store=db) {
  const id=gradingEntryId(sessionId,questionId,kind);
  return store.transaction('rw',store.entries,store.mistakes,async()=>{
    const mid=mistakeId(questionId), old=await store.mistakes.get(mid);
    await store.mistakes.put({...old,id:mid,paperId,questionId,sessionIds:[...new Set([...(old?.sessionIds??[]),sessionId])],mastered:old?.mastered??false,createdAt:old?.createdAt??Date.now(),updatedAt:Date.now()});
    if(!await store.entries.get(id)) await store.entries.add({id,mistakeId:mid,sessionId,kind,note:'',createdAt:Date.now(),updatedAt:Date.now()});
    return id;
  });
}
export async function addPhotos(entryId:string,files:File[],store=db) {
  if(files.some(f=>!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(f.type))) throw new Error('请选择 JPG、PNG、WebP 等浏览器可显示的图片；HEIC 请先转换为 JPG。');
  if(files.some(f=>f.size>25*1024*1024)) throw new Error('单张照片请小于 25 MB。');
  await store.transaction('rw',store.entries,store.photos,store.mistakes,async()=>{
    const entry=await store.entries.get(entryId);
    if(!entry) throw new Error('订正记录不存在。');
    await store.photos.bulkAdd(files.map(f=>({id:uid(),entryId,name:f.name,blob:f,rotation:0,createdAt:Date.now()})));
    await store.entries.update(entryId,{updatedAt:Date.now()});
    await store.mistakes.update(entry.mistakeId,{updatedAt:Date.now()});
  });
}
export async function exportBackup(store=db) {
  const data=await store.transaction('r',store.tables,async()=>({sessions:await store.sessions.toArray(),mistakes:await store.mistakes.toArray(),entries:await store.entries.toArray(),photos:await store.photos.toArray(),criticalAttempts:await store.criticalAttempts.toArray(),csAnswers:await store.csAnswers.toArray(),csAnswerPhotos:await store.csAnswerPhotos.toArray(),topicAttempts:await store.topicAttempts.toArray()}));
  const zip=new JSZip();
  const photos=[];
  for(const {blob,...p} of data.photos) {zip.file(`photos/${p.id}`,await blob.arrayBuffer());photos.push({...p,mime:blob.type,path:`photos/${p.id}`});}
  const csAnswerPhotos=[];for(const {blob,...p} of data.csAnswerPhotos){zip.file(`answer-photos/${p.id}`,await blob.arrayBuffer());csAnswerPhotos.push({...p,mime:blob.type,path:`answer-photos/${p.id}`});}
  zip.file('backup.json',JSON.stringify({format:'bpho-study',version:1,exportedAt:Date.now(),...data,photos,csAnswerPhotos},null,2));
  return zip.generateAsync({type:'blob',compression:'STORE'});
}
function assert(ok:unknown): asserts ok { if(!ok) throw new Error('备份格式或数据无效，未修改本机数据。'); }
const str=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<500;
const time=(s:unknown)=>typeof s==='number'&&Number.isFinite(s)&&s>0;
export async function restoreBackup(file: Blob,papers:Paper[],store=db) {
  if(file.size>1024*1024*1024) throw new Error('备份文件过大，请使用小于 1 GB 的备份。');
  const zip=await JSZip.loadAsync(await file.arrayBuffer()); const manifest=zip.file('backup.json'); assert(manifest);
  const b=JSON.parse(await manifest.async('text'));
  assert(b.format==='bpho-study'&&b.version===1);
  for(const key of ['sessions','mistakes','entries','photos']) assert(Array.isArray(b[key])&&b[key].length<100000);
  b.criticalAttempts??=[];b.csAnswers??=[];b.csAnswerPhotos??=[];b.topicAttempts??=[];
  assert(Array.isArray(b.topicAttempts)&&b.topicAttempts.length<100000&&b.topicAttempts.every((a:TopicAttempt)=>validTopicAttempt(a,papers)));
  assert(Array.isArray(b.csAnswers)&&b.csAnswers.length<100000&&Array.isArray(b.csAnswerPhotos)&&b.csAnswerPhotos.length<100000);
  assert(Array.isArray(b.criticalAttempts)&&b.criticalAttempts.length<100000&&b.criticalAttempts.every(validCriticalAttempt));
  // Keep old whole-Section backups readable without inventing per-letter scores.
  for(const s of b.sessions as Session[]) {if(Array.isArray(s?.questionIds)){const target=legacyTarget(s.paperId,s.questionIds,papers);if(target){s.paperId=target.id;s.archived=true;}}}
  for(const m of b.mistakes as Mistake[]) {const target=legacyTarget(m?.paperId,[m?.questionId],papers);if(target)m.paperId=target.id;}
  const unique=(rows:{id:string}[])=>{const ids=rows.map(r=>r.id);assert(ids.every(str)&&new Set(ids).size===ids.length);};
  [b.sessions,b.mistakes,b.entries,b.photos,b.criticalAttempts,b.csAnswers,b.csAnswerPhotos,b.topicAttempts].forEach(unique);
  unique([...b.sessions,...b.topicAttempts]);
  for(const s of b.sessions as Session[]) {
    const paper=papers.find(p=>p.id===s.paperId); assert(paper&&time(s.startedAt)&&time(s.updatedAt));
    assert(s.archived===undefined||typeof s.archived==='boolean');
    if(s.archived)assert(paper.legacy);
    assert(Array.isArray(s.questionIds)&&s.questionIds.length===paper.choose&&new Set(s.questionIds).size===s.questionIds.length&&s.questionIds.every(id=>paper.questions.some(q=>q.id===id)));
    assert(Number.isInteger(s.position)&&s.position>=0&&s.position<s.questionIds.length&&Number.isInteger(s.markingPosition)&&s.markingPosition>=0&&s.markingPosition<s.questionIds.length);
    assert(Array.isArray(s.done)&&s.done.every(id=>s.questionIds.includes(id))&&s.grades&&typeof s.grades==='object');
    if(s.submittedAt!==undefined) assert(time(s.submittedAt)&&s.submittedAt>=s.startedAt);
    if(s.completedAt!==undefined) assert(s.submittedAt&&time(s.completedAt)&&s.completedAt>=s.submittedAt);
    for(const [id,g] of Object.entries(s.grades)) assert(s.questionIds.includes(id)&&typeof g.score==='string'&&g.score.length<100&&typeof g.wrong==='boolean'&&typeof g.note==='string');
    if(s.completedAt) assert(s.questionIds.every(id=>validScore(s.grades[id]?.score??'',paper.questions.find(q=>q.id===id)!.maxScore)));
  }
  const mids=new Set<string>(b.mistakes.map((m:Mistake)=>m.id)), eids=new Set<string>(b.entries.map((e:Entry)=>e.id)), sids=new Set<string>([...b.sessions,...b.topicAttempts].map((s:Session|TopicAttempt)=>s.id));
  for(const m of b.mistakes as Mistake[]) assert(m.id===mistakeId(m.questionId)&&papers.some(p=>p.id===m.paperId&&p.questions.some(q=>q.id===m.questionId))&&Array.isArray(m.sessionIds)&&m.sessionIds.every(id=>sids.has(id))&&typeof m.mastered==='boolean'&&time(m.createdAt)&&time(m.updatedAt));
  for(const e of b.entries as Entry[]) assert(mids.has(e.mistakeId)&&(!e.sessionId||sids.has(e.sessionId))&&['work','correction'].includes(e.kind)&&typeof e.note==='string'&&time(e.createdAt)&&time(e.updatedAt));
  for(const a of b.csAnswers as CSAnswer[]){const session=(b.sessions as Session[]).find(s=>s.id===a.sessionId),paper=papers.find(p=>p.id===session?.paperId),q=paper?.questions.find(q=>q.id===a.questionId);assert(paper?.subject==='cs'&&session?.questionIds.includes(a.questionId)&&q?.parts?.includes(a.partId)&&typeof a.text==='string'&&a.text.length<=200000&&time(a.updatedAt));}
  const aids=new Set(b.csAnswers.map((a:CSAnswer)=>a.id));
  let total=0; const photos:Photo[]=[];
  for(const p of b.photos) { assert(eids.has(p.entryId)&&str(p.name)&&/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(p.mime)&&p.path===`photos/${p.id}`&&[0,90,180,270].includes(p.rotation)&&time(p.createdAt)); const z=zip.file(p.path);assert(z);const bytes=await z.async('uint8array');total+=bytes.byteLength;assert(total<1024*1024*1024);photos.push({id:p.id,entryId:p.entryId,name:p.name,rotation:p.rotation,createdAt:p.createdAt,blob:new Blob([bytes as BlobPart],{type:p.mime})}); }
  const csPhotos:Photo[]=[];for(const p of b.csAnswerPhotos){assert(aids.has(p.entryId)&&str(p.name)&&/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(p.mime)&&p.path===`answer-photos/${p.id}`&&[0,90,180,270].includes(p.rotation)&&time(p.createdAt));const z=zip.file(p.path);assert(z);const bytes=await z.async('uint8array');total+=bytes.byteLength;assert(total<1024*1024*1024);csPhotos.push({id:p.id,entryId:p.entryId,name:p.name,rotation:p.rotation,createdAt:p.createdAt,blob:new Blob([bytes as BlobPart],{type:p.mime})});}
  await store.transaction('rw',store.tables,async()=>{
    for(const a of b.topicAttempts as TopicAttempt[]){const old=await store.topicAttempts.get(a.id);if(!old||a.updatedAt>old.updatedAt)await store.topicAttempts.put(a);}
    for(const a of b.csAnswers as CSAnswer[]){const old=await store.csAnswers.get(a.id);if(!old||a.updatedAt>old.updatedAt)await store.csAnswers.put(a);}
    for(const p of csPhotos)if(!await store.csAnswerPhotos.get(p.id))await store.csAnswerPhotos.add(p);
    for(const s of b.sessions as Session[]) { const old=await store.sessions.get(s.id);if(!old||s.updatedAt>old.updatedAt)await store.sessions.put(s); }
    for(const m of b.mistakes as Mistake[]) {const old=await store.mistakes.get(m.id);await store.mistakes.put(old?{...(m.updatedAt>old.updatedAt?m:old),sessionIds:[...new Set([...m.sessionIds,...old.sessionIds])]}:m);}
    for(const e of b.entries as Entry[]) {const old=await store.entries.get(e.id);if(!old||e.updatedAt>old.updatedAt)await store.entries.put(e);}
    for(const p of photos) if(!await store.photos.get(p.id))await store.photos.add(p);
    for(const a of b.criticalAttempts as CriticalAttempt[]){const old=await store.criticalAttempts.get(a.id);if(!old||!old.submittedAt&&(a.submittedAt||a.updatedAt>old.updatedAt))await store.criticalAttempts.put(a);}
    assert((await store.criticalAttempts.toArray()).filter(a=>!a.submittedAt).length<=1);
    const active=(await store.sessions.toArray()).filter(s=>!s.submittedAt&&!s.archived);assert(active.length+(await store.topicAttempts.toArray()).filter(a=>!a.submittedAt).length<=1);
  });
  return {sessions:b.sessions.length,photos:photos.length,criticalAttempts:b.criticalAttempts.length,topicAttempts:b.topicAttempts.length};
}
