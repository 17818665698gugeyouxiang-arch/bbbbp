export const tableNames=['sessions','mistakes','entries','photos','criticalAttempts','csAnswers','csAnswerPhotos'] as const;
export type Row={id:string;[key:string]:any};
export type Snapshot=Record<typeof tableNames[number],Row[]>;
export const emptySnapshot=():Snapshot=>({sessions:[],mistakes:[],entries:[],photos:[],criticalAttempts:[],csAnswers:[],csAnswerPhotos:[]});
export const equal=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;if(a===undefined||b===undefined||a===null||b===null)return false;
 if(typeof a!=='object'||typeof b!=='object')return false;
 const ak=Object.keys(a),bk=Object.keys(b);return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&equal((a as any)[k],(b as any)[k]));
};
export class SyncConflict extends Error{constructor(public paths:string[]){super('两边修改了同一项内容，请选择要保留的版本。');}}
export function mergeSnapshots(base:Snapshot,local:Snapshot,remote:Snapshot,choice?:'local'|'remote'):Snapshot{
 const conflicts:string[]=[];
 function value(b:any,l:any,r:any,path:string):any{
  if(equal(l,b))return r;if(equal(r,b)||equal(l,r))return l;
  if(path.endsWith('.updatedAt')&&typeof l==='number'&&typeof r==='number')return Math.max(l,r);
  if((path.endsWith('.sessionIds')||path.endsWith('.done'))&&Array.isArray(l)&&Array.isArray(r)){
   const original=new Set(Array.isArray(b)?b:[]);return [...new Set([...l,...r])].filter(x=>!original.has(x)||l.includes(x)&&r.includes(x));
  }
  if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r)&&(b===undefined||b&&typeof b==='object'&&!Array.isArray(b))){
   return Object.fromEntries([...new Set([...Object.keys(b??{}),...Object.keys(l),...Object.keys(r)])].map(k=>[k,value(b?.[k],l[k],r[k],path+'.'+k)]).filter(([,v])=>v!==undefined));
  }
  // Navigation positions are local conveniences; they must not block score/photo sync.
  if(path.endsWith('.position')||path.endsWith('.markingPosition'))return r;
  if(choice)return choice==='local'?l:r;
  conflicts.push(path);return l;
 }
 const out=emptySnapshot();for(const t of tableNames){const b=new Map((base[t]??[]).map(r=>[r.id,r])),l=new Map((local[t]??base[t]??[]).map(r=>[r.id,r])),r=new Map((remote[t]??base[t]??[]).map(r=>[r.id,r]));for(const id of [...new Set([...b.keys(),...l.keys(),...r.keys()])].sort()){
  // There is no UI to delete study history. Missing rows can be caused by a
  // cleared browser or stale snapshot and must not erase the other copy.
  // Photos have an explicit delete action and keep three-way deletion semantics.
  const original=b.get(id),left=l.get(id),right=r.get(id);
  const row=t!=='photos'&&t!=='csAnswerPhotos'&&(!left||!right)?value(original,left??original,right??original,`${t}.${id}`):value(original,left,right,`${t}.${id}`);
  if(row)out[t].push(row);
 }}
 if(conflicts.length)throw new SyncConflict(conflicts);return out;
}
export function bootstrap(local:Snapshot,remote:Snapshot,choice?:'local'|'remote'):Snapshot{
 return mergeSnapshots(emptySnapshot(),local,remote,choice);
}
