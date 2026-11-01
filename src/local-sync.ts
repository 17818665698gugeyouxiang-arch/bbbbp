import {db} from './db';
import Dexie from 'dexie';
import {bootstrap,emptySnapshot,equal,mergeSnapshots,SyncConflict,tableNames,type Snapshot,type Row} from './sync-merge';
import type {Photo} from './model';
import {cloudEnabled} from './site-config';
import {cloudJson,cloudPhoto,cloudUser} from './cloud';

export type SyncStatus={state:'working'|'saved'|'offline'|'conflict';message:string;at?:number;conflicts?:string[]};
type Server={serverId:string;revision:number;data:Snapshot};
type Baseline={serverId:string;data:Snapshot};
const photoHashes=new Map<string,string>();
let controller:{tick:(required?:boolean,choice?:'local'|'remote')=>Promise<void>}|undefined;
export async function syncNow(required=false,choice?:'local'|'remote'){await controller?.tick(required,choice);}

async function jsonFetch(url:string,options?:RequestInit){
 if(cloudEnabled)return cloudJson(url,options);
 const response=await fetch(url,{...options,cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok){let message='本机同步服务暂时不可用';try{message=(await response.json()).error??message;}catch{/* Old static server has no API. */}throw Object.assign(Error(message),{status:response.status});}
 return response.json();
}
const serial=(t:string,row:any):Row=>{
 if(t!=='photos'&&t!=='csAnswerPhotos')return row;
 const {blob,...rest}=row;return {...rest,mime:blob.type,hash:photoHashes.get(row.id)};
};
async function readLocal(){
 const rows=await db.transaction('r',tableNames.map(t=>db.table(t)),async()=>Object.fromEntries(await Promise.all(tableNames.map(async t=>[t,await db.table(t).toArray()]))));
 for(const p of [...rows.photos,...rows.csAnswerPhotos] as Photo[])if(!photoHashes.has(p.id)){
  const hash=await crypto.subtle.digest('SHA-256',await p.blob.arrayBuffer());photoHashes.set(p.id,[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join(''));
 }
 return {data:Object.fromEntries(tableNames.map(t=>[t,rows[t].map((r:any)=>serial(t,r)).sort((a:Row,b:Row)=>a.id<b.id?-1:a.id>b.id?1:0)])) as Snapshot,photos:new Map(([...rows.photos,...rows.csAnswerPhotos] as Photo[]).map(p=>[p.id,p.blob]))};
}
async function uploadPhotos(data:Snapshot,remote:Snapshot,blobs:Map<string,Blob>){
 const known=new Map([...remote.photos,...remote.csAnswerPhotos].map(p=>[p.id,p]));
 for(const p of [...data.photos,...data.csAnswerPhotos]){const old=known.get(p.id);if(old){if(old.hash!==p.hash)throw new SyncConflict([`photos.${p.id}.hash`]);continue;}
  const blob=blobs.get(p.id);if(!blob)throw Error('待同步图片未找到，请保留当前浏览器数据。');
  const result=await jsonFetch('/api/photos/'+encodeURIComponent(p.id),{method:'PUT',headers:{'Content-Type':blob.type},body:blob});if(result.hash!==p.hash)throw Error('图片上传校验失败');
 }
}
async function applyShared(captured:Snapshot,target:Server,blobs:Map<string,Blob>){
 // Download and verify missing images before changing any browser records.
 for(const p of [...target.data.photos,...target.data.csAnswerPhotos])if(!blobs.has(p.id)){
  let bytes:ArrayBuffer;if(cloudEnabled)bytes=await cloudPhoto(p.id);else{const response=await fetch('/api/photos/'+encodeURIComponent(p.id),{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('共享图片读取失败');bytes=await response.arrayBuffer();}const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==p.hash)throw Error('共享图片校验失败，未修改本机记录');blobs.set(p.id,new Blob([bytes],{type:p.mime}));photoHashes.set(p.id,p.hash);
 }
 let changed=false,pending=false;
 await db.transaction('rw',db.tables,async()=>{
  const current=emptySnapshot(),existingPhotos=new Map<string,Blob>();
  for(const t of tableNames){const rows=await db.table(t).toArray();for(const r of rows){current[t].push(serial(t,r));if(t==='photos'||t==='csAnswerPhotos')existingPhotos.set(r.id,r.blob);}}
  // Rebase edits made while network requests were in flight, never erase them.
  const next=mergeSnapshots(captured,current,target.data);
  pending=!equal(next,target.data);
  for(const t of tableNames){const old=new Map(current[t].map(r=>[r.id,r])),wanted=new Map(next[t].map(r=>[r.id,r]));
   for(const id of old.keys())if(!wanted.has(id)){await db.table(t).delete(id);changed=true;}
   for(const row of next[t])if(!equal(row,old.get(row.id))){const value=(t==='photos'||t==='csAnswerPhotos')?(()=>{const {hash,mime,...metadata}=row;return {...metadata,blob:existingPhotos.get(row.id)??blobs.get(row.id)};})():row;await db.table(t).put(value);changed=true;}
  }
  await db.syncMeta.put({id:'baseline',value:{serverId:target.serverId,data:target.data} satisfies Baseline});
 });
 if(changed)window.dispatchEvent(new Event('study-data-sync'));
 return pending;
}

export function startLocalSync(onStatus:(status:SyncStatus)=>void){
 let stopped=false,inFlight:Promise<void>|undefined,mutationTimer:number|undefined,first=true;
 async function once(choice?:'local'|'remote'){
  if(cloudEnabled&&!await cloudUser()){onStatus({state:'saved',message:'游客模式：记录只保存在此浏览器，登录后使用独立的云端学习空间。'});return;}
  if(first)onStatus({state:'working',message:cloudEnabled?'正在同步学习记录…':'正在同步本机记录…'});first=false;
  let baseline=(await db.syncMeta.get('baseline'))?.value as Baseline|undefined;
  const remote:Server=await jsonFetch('/api/study');
  remote.data={...emptySnapshot(),...remote.data};
  if(stopped)return;
  if(baseline&&baseline.serverId!==remote.serverId)throw Error('共享数据位置已更换。已保留浏览器记录，请先备份并检查项目 data 文件夹。');
  const local=await readLocal();
  let merged:Snapshot;
  try{merged=baseline?mergeSnapshots(baseline.data,local.data,remote.data,choice):bootstrap(local.data,remote.data,choice);}
  catch(e){if(e instanceof SyncConflict)await db.syncMeta.put({id:'conflict-'+Date.now(),value:{local:local.data,shared:remote.data}});throw e;}
  let target=remote;
  if(!equal(merged,remote.data)){
   await uploadPhotos(merged,remote.data,local.photos);
   target=await jsonFetch('/api/study',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serverId:remote.serverId,revision:remote.revision,data:merged,...(!baseline?{migration:local.data}:{})})});
  }
  if(stopped)return;
  const pending=await applyShared(local.data,target,local.photos);
  onStatus(pending?{state:'working',message:'已保存在此浏览器，继续同步最新修改…'}:{state:'saved',message:cloudEnabled?'已同步到个人云端':'已同步到本机共享数据',at:Date.now()});
 }
 async function tick(required=false,choice?:'local'|'remote'){
  if(inFlight){await inFlight;if(required||choice)return tick(required,choice);return;}
  const job=async()=>{
   try{for(let attempt=0;attempt<3;attempt++){try{await once(choice);return;}catch(e){if((e as any).status===409&&attempt<2)continue;throw e;}}}
   catch(e){const message=e instanceof Error?e.message:'本机同步失败';onStatus(e instanceof SyncConflict?{state:'conflict',message,conflicts:e.paths}:{state:'offline',message:'尚未同步：'+message+'。当前修改仍保存在此浏览器，恢复连接后会重试。'});if(required)throw Error(message);}
  };
  inFlight=(navigator.locks?navigator.locks.request('bpho-study-local-sync',job):job()).finally(()=>{inFlight=undefined;});await inFlight;
 }
 controller={tick};
 const focus=()=>{void tick();};window.addEventListener('focus',focus);window.addEventListener('online',focus);
 const mutated=(parts:Record<string,unknown>)=>{if(!Object.keys(parts).some(key=>key.includes('/'+db.name+'/')&&!key.includes('/syncMeta/')))return;onStatus({state:'working',message:'已保存在此浏览器，正在同步…'});window.clearTimeout(mutationTimer);mutationTimer=window.setTimeout(focus,150);};
 Dexie.on('storagemutated',mutated);
 const timer=window.setInterval(()=>{if(!stopped)void tick();},cloudEnabled?15000:2500);void tick();
 return ()=>{stopped=true;window.clearInterval(timer);window.clearTimeout(mutationTimer);Dexie.on('storagemutated').unsubscribe(mutated);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);controller=undefined;};
}
