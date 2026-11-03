import {readFile,writeFile,mkdir,rename,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {validTopicRecord} from './topic-validation.mjs';
import {randomUUID,createHash} from 'node:crypto';

const tables=['sessions','mistakes','entries','photos','criticalAttempts','csAnswers','csAnswerPhotos','topicAttempts'];
const empty=()=>Object.fromEntries(tables.map(t=>[t,[]]));
export function localData(directory){
 const file=path.join(directory,'study-data.json');let queue=Promise.resolve();
 const ready=(async()=>{await mkdir(path.join(directory,'photos'),{recursive:true});try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('本机共享数据读取失败，请保留 data 文件夹并检查数据文件。');const initial={serverId:randomUUID(),revision:0,data:empty()};await writeFile(file,JSON.stringify(initial),{flag:'wx'});return initial;}})();
 const image=id=>path.join(directory,'photos',createHash('sha256').update(id).digest('hex'));
 async function body(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw Error('数据过大');chunks.push(chunk);}return Buffer.concat(chunks);}
 const json=(res,status,data)=>res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(data));
 async function commit(next){
  const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(next));
  // Keep every replaced revision, not only the immediately previous write.
  // Never delete these recovery snapshots automatically.
  const history=path.join(directory,'history');await mkdir(history,{recursive:true});
  try{await copyFile(file,path.join(history,`before-revision-${next.revision}-${Date.now()}-${randomUUID()}.json`));await copyFile(file,file+'.previous');}catch(e){if(e.code!=='ENOENT')throw e;}
  await rename(tmp,file);
 }
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/'))return false;
  const origin=req.headers.origin;
  if(req.headers.host!==`127.0.0.1:${req.socket.localPort}`||origin&&origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'只允许从本机网站访问学习数据。'});return true;}
  try{
   if(url.pathname==='/api/study'&&req.method==='GET'){
    await queue;const state=await ready;json(res,200,{...state,capabilities:['fp1-topics-v1','cs-topics-v1'],data:{...empty(),...state.data}});return true;
   }
   if(url.pathname.startsWith('/api/photos/')){
    const id=decodeURIComponent(url.pathname.slice('/api/photos/'.length));if(!id||id.length>500)throw Error('图片编号无效');
    if(req.method==='PUT'){
     if(!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(req.headers['content-type']??''))throw Error('图片格式无效');
     await ready;const bytes=await body(req,25*1024*1024);const dest=image(id),hash=createHash('sha256').update(bytes).digest('hex');
     const job=queue.then(async()=>{try{const old=await readFile(dest);if(!old.equals(bytes))throw Error('图片编号冲突，原图片已保留。');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(dest+'.tmp',bytes);await rename(dest+'.tmp',dest);}});queue=job.catch(()=>{});await job;json(res,200,{hash});return true;
    }
    if(req.method==='GET'){await ready;const bytes=await readFile(image(id));res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(bytes);return true;}
   }
   if(url.pathname==='/api/study'&&req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw Error('请求格式无效');
    const payload=JSON.parse((await body(req,40*1024*1024)).toString('utf8'));
    const job=queue.then(async()=>{
     const current=await ready;
     if(payload.serverId!==current.serverId||payload.revision!==current.revision){json(res,409,{error:'其他浏览器已保存新内容，正在重新合并。'});return;}
     const data=payload.data;if(!data||typeof data!=='object')throw Error('学习数据无效');
     if(!Object.hasOwn(data,'topicAttempts')&&(current.data.topicAttempts??[]).length)throw Error('请刷新网站后再同步：旧版页面无法安全保存专项记录。');
     // Older browsers do not know this table; omission must never delete it.
     for(const t of ['criticalAttempts','csAnswers','csAnswerPhotos','topicAttempts'])data[t]??=current.data[t]??[];
     for(const t of tables){if(!Array.isArray(data[t])||data[t].length>100000)throw Error('学习数据格式无效');const ids=new Set();for(const row of data[t]){if(!row||typeof row.id!=='string'||!row.id||row.id.length>500||ids.has(row.id))throw Error('重复或无效的记录编号');ids.add(row.id);}}
     for(const t of ['sessions','mistakes','entries','criticalAttempts','csAnswers','topicAttempts']){
      const ids=new Set(data[t].map(r=>r.id));
      if((current.data[t]??[]).some(r=>!ids.has(r.id))){json(res,422,{error:'已阻止同步删除历史记录。请刷新网站重新合并；旧记录仍完整保留。'});return;}
     }
     if(!data.topicAttempts.every(validTopicRecord))throw Error('专项记录无效');
     const allIds=[...data.sessions,...data.topicAttempts].map(r=>r.id);if(new Set(allIds).size!==allIds.length)throw Error('训练编号冲突');
     for(const old of current.data.topicAttempts??[]){const next=data.topicAttempts.find(a=>a.id===old.id);if(next&&['kind','refs','questionIds','years','topics','startedAt'].some(k=>JSON.stringify(old[k])!==JSON.stringify(next[k])))throw Error('专项试卷开始后不可修改');}
     for(const s of data.sessions)if(typeof s.paperId!=='string'||!Array.isArray(s.questionIds)||!s.grades||!Number.isFinite(s.startedAt))throw Error('训练记录无效');
     for(const a of data.criticalAttempts){const q=a.question;if(!q||!['binomial','poisson'].includes(q.distribution)||!['normal','closest'].includes(q.rule)||!['lower','upper','two'].includes(q.tail)||![.05,.1].includes(q.sig)||!Number.isFinite(a.startedAt)||a.startedAt<=0||!Number.isFinite(a.updatedAt)||a.updatedAt<a.startedAt||typeof a.lower!=='string'||typeof a.upper!=='string'||a.lower.length>20||a.upper.length>20||a.submittedAt!==undefined&&(!Number.isFinite(a.submittedAt)||a.submittedAt<a.startedAt||typeof a.correct!=='boolean'))throw Error('专项记录无效');}
     if(!payload.migration&&(current.data.criticalAttempts??[]).filter(a=>!a.submittedAt).length<=1&&data.criticalAttempts.filter(a=>!a.submittedAt).length>1)throw Error('其他浏览器已有进行中的专项测试，请先完成。');
     const oldPhotos=new Map([...current.data.photos,...(current.data.csAnswerPhotos??[])].map(p=>[p.id,p]));
     for(const p of [...data.photos,...data.csAnswerPhotos]){if(!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(p.mime)||typeof p.hash!=='string')throw Error('图片信息无效');if(oldPhotos.get(p.id)?.hash===p.hash){await stat(image(p.id));continue;}const bytes=await readFile(image(p.id));if(createHash('sha256').update(bytes).digest('hex')!==p.hash)throw Error('图片校验失败，未保存记录');}
     const answers=new Map(data.csAnswers.map(a=>[a.id,a]));for(const a of data.csAnswers){const session=data.sessions.find(s=>s.id===a.sessionId)??data.topicAttempts.find(t=>t.id===a.sessionId&&t.kind==='cs-topics');if(!session?.questionIds.includes(a.questionId)||typeof a.partId!=='string'||typeof a.text!=='string'||a.text.length>200000||!Number.isFinite(a.updatedAt))throw Error('计算机作答数据无效');}if(data.csAnswerPhotos.some(p=>!answers.has(p.entryId)))throw Error('作答图片关联不完整');
     const mids=new Set(data.mistakes.map(r=>r.id)),eids=new Set(data.entries.map(r=>r.id)),sids=new Set([...data.sessions,...data.topicAttempts].map(r=>r.id));
     if(data.entries.some(r=>!mids.has(r.mistakeId)||r.sessionId&&!sids.has(r.sessionId))||data.photos.some(r=>!eids.has(r.entryId))||data.mistakes.some(r=>!Array.isArray(r.sessionIds)||r.sessionIds.some(id=>!sids.has(id))))throw Error('记录关联不完整，未保存修改');
     if(!payload.migration&&[...current.data.sessions,...(current.data.topicAttempts??[])].filter(s=>!s.submittedAt&&!s.archived).length<=1&&[...data.sessions,...data.topicAttempts].filter(s=>!s.submittedAt&&!s.archived).length>1)throw Error('其他浏览器已有未交卷训练，请继续已有训练。');
     // Concurrent starts are retained, never silently submitted or discarded.
     // The UI blocks further starts until the user finishes the existing attempts.
     const next={serverId:current.serverId,revision:current.revision+1,data,updatedAt:Date.now()};
     if(payload.migration){const dest=path.join(directory,`migration-${Date.now()}-${randomUUID()}.json`);await writeFile(dest,JSON.stringify({serverId:current.serverId,data:payload.migration}));}
     await commit(next);Object.assign(current,next);json(res,200,{...next,capabilities:['fp1-topics-v1','cs-topics-v1']});
    });queue=job.catch(()=>{});await job;return true;
   }
   json(res,404,{error:'接口不存在'});
  }catch(e){json(res,500,{error:e.code==='ENOENT'?'共享图片不存在，未修改记录。':e.message||'本机同步失败'});}
  return true;
 };
}
