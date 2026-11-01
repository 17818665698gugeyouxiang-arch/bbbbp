import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {liveQuery} from 'dexie';
import {db,type StudyDB} from './db';
import {type Question,type Paper,type Photo,uid} from './model';
import {Modal,Crops} from './media';
import './cs.css';
export const csAnswerId=(sessionId:string,questionId:string,partId:string)=>`${sessionId}:${questionId}:${partId}`;
export async function saveCSAnswer(sessionId:string,questionId:string,partId:string,text:string,store:StudyDB=db){
 if(text.length>200000)throw Error('本小问内容过长。');
 return store.transaction('rw',store.sessions,store.csAnswers,async()=>{
  const s=await store.sessions.get(sessionId);if(!s||s.submittedAt||!s.questionIds.includes(questionId))throw Error('此场训练已交卷或不存在，作答未改动。');
  const row={id:csAnswerId(sessionId,questionId,partId),sessionId,questionId,partId,text,updatedAt:Date.now()};await store.csAnswers.put(row);return row;
 });
}
export async function uploadCSPhotos(sessionId:string,questionId:string,partId:string,files:File[],store:StudyDB=db){
 if(files.some(f=>!/^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(f.type)||f.size>25*1024*1024))throw Error('请选择不超过 25 MB 的 JPG、PNG、WebP 等图片。');
 return store.transaction('rw',store.sessions,store.csAnswers,store.csAnswerPhotos,async()=>{
  const s=await store.sessions.get(sessionId);if(!s||s.submittedAt||!s.questionIds.includes(questionId))throw Error('训练已交卷，不能修改原始作答。');
  const id=csAnswerId(sessionId,questionId,partId);if(!await store.csAnswers.get(id))await store.csAnswers.add({id,sessionId,questionId,partId,text:'',updatedAt:Date.now()});
  await store.csAnswerPhotos.bulkAdd(files.map(f=>({id:'cs-photo-'+uid(),entryId:id,name:f.name,blob:f,rotation:0,createdAt:Date.now()})));
 });
}
const flushers=new Map<string,()=>Promise<void>>();
export async function flushCSAnswers(){for(const flush of flushers.values())await flush();}
export function CSReference({paper}:{paper:Paper}){const [open,setOpen]=useState(false);return <><button className="secondary" onClick={()=>setOpen(true)}>参考资料 / Insert</button>{open&&<Modal title={`${paper.title} · 参考资料`} close={()=>setOpen(false)}><p>{paper.instructions}</p><Crops crops={paper.insert??[]} label="Insert"/>{!paper.insert?.length&&<p>本卷无需额外 Insert。</p>}</Modal>}</>;}
export function CSAnswers({sessionId,question,readonly=false}:{sessionId:string;question:Question;readonly?:boolean}){
 return <section className="cs-answers" aria-label={readonly?'我的原始作答':'计算机作答区'}><h2>{readonly?'我的原始作答':'我的作答'}</h2>{(question.parts??[question.number]).map(part=><CSPart key={`${sessionId}:${part}`} sessionId={sessionId} questionId={question.id} partId={part} readonly={readonly}/>)}</section>;
}
function CSPart({sessionId,questionId,partId,readonly}:{sessionId:string;questionId:string;partId:string;readonly:boolean}){
 const id=csAnswerId(sessionId,questionId,partId),[text,setText]=useState(''),[photos,setPhotos]=useState<Photo[]>([]),[state,setState]=useState('正在读取…'),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[loaded,setLoaded]=useState(false);
 const inputRef=useRef<HTMLTextAreaElement>(null),caret=useRef<{value:string;position:number}|undefined>(undefined);
 const uploadFailure=useRef('');
 const latest=useRef(''),saved=useRef(''),dirty=useRef(false),queue=useRef(Promise.resolve()),mounted=useRef(true);
 useLayoutEffect(()=>{const next=caret.current;if(next&&inputRef.current?.value===next.value){inputRef.current.setSelectionRange(next.position,next.position);caret.current=undefined;}},[text]);
 async function persist(value:string){await saveCSAnswer(sessionId,questionId,partId,value);saved.current=value;if(latest.current===value){dirty.current=false;if(mounted.current){setState('已保存');setError('');}}}
 async function flush(){await queue.current;if(uploadFailure.current)throw Error(uploadFailure.current);if(dirty.current)await persist(latest.current);}
 useEffect(()=>{mounted.current=true;const key=id;flushers.set(key,flush);return()=>{mounted.current=false;if(!dirty.current)flushers.delete(key);};},[id]);
 useEffect(()=>{const sub=liveQuery(async()=>({row:await db.csAnswers.get(id),photos:await db.csAnswerPhotos.where('entryId').equals(id).toArray()})).subscribe({next:({row,photos})=>{setPhotos(photos);setLoaded(true);if(!dirty.current){latest.current=saved.current=row?.text??'';setText(latest.current);setState('已保存');}},error:e=>setError(String(e))});return()=>sub.unsubscribe();},[id]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty.current||uploading){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[uploading]);
 function edit(value:string){latest.current=value;dirty.current=true;setText(value);setState('正在保存…');queue.current=queue.current.catch(()=>{}).then(()=>persist(value)).catch(e=>{if(mounted.current){setError(e instanceof Error?e.message:'保存失败');setState('未保存');}});}
 return <div className="cs-answer-part"><h3>{partId}</h3>{readonly?<pre className="cs-answer-text">{text||'未输入文字，可查看下方作答图片。'}</pre>:<><textarea ref={inputRef} aria-label={`${partId} 作答`} spellCheck={false} disabled={!loaded||uploading} value={text} maxLength={200000} placeholder="输入文字或伪代码；Tab 缩进，也可在纸上作答后上传图片。" onChange={e=>edit(e.target.value)} onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();const field=e.currentTarget,start=field.selectionStart,end=field.selectionEnd;const value=text.slice(0,start)+'    '+text.slice(end);caret.current={value,position:start+4};edit(value);}}}/><div className="cs-answer-tools"><small>{uploading?'正在保存图片…':state}</small><label className="secondary">上传纸上作答<input aria-label={`${partId} 作答图片`} type="file" accept="image/*" multiple hidden disabled={uploading||!loaded} onChange={async e=>{const files=[...(e.target.files??[])];e.target.value='';if(!files.length)return;setUploading(true);setError('');uploadFailure.current='';const key=id+':upload';let resolve!:()=>void;const done=new Promise<void>(r=>resolve=r);flushers.set(key,async()=>{await done;if(uploadFailure.current)throw Error(uploadFailure.current);});try{await flush();await uploadCSPhotos(sessionId,questionId,partId,files);}catch(e){uploadFailure.current=(e instanceof Error?e.message:'图片保存失败')+'；请重新选择图片上传。';setError(uploadFailure.current);}finally{setUploading(false);resolve();flushers.delete(key);}}}/></label></div></>}
 {error&&<p className="field-error" role="alert">{error}{!readonly&&<button className="text-button" onClick={()=>void flush().catch(e=>setError(String(e)))}>重试保存</button>}</p>}
 <div className="photo-grid">{photos.map(photo=><CSPhoto key={photo.id} photo={photo}/>)}</div></div>;
}
function CSPhoto({photo}:{photo:Photo}){const [url,setUrl]=useState(''),[zoom,setZoom]=useState(false);useEffect(()=>{const src=URL.createObjectURL(photo.blob);setUrl(src);return()=>URL.revokeObjectURL(src);},[photo.blob]);return <figure className="cs-photo"><button aria-label={`放大作答图片 ${photo.name}`} onClick={()=>setZoom(true)}><img src={url} alt={photo.name}/></button><figcaption>{photo.name}</figcaption>{zoom&&<Modal title={photo.name} close={()=>setZoom(false)}><img className="zoom-image" src={url} alt={photo.name}/></Modal>}</figure>;}
