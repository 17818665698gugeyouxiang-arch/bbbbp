import {useEffect,useState} from 'react';
import {liveQuery} from 'dexie';
import {db} from './db';
const KEY='study-backup-status',EVENT='study-backup-status-change',WEEK=7*24*3600000;
type Checkpoint={exportedAt:number;snoozedAt:number};
function read():Checkpoint {try{const value=JSON.parse(localStorage.getItem(KEY)??'{}');return {exportedAt:Number.isFinite(value.exportedAt)?value.exportedAt:0,snoozedAt:Number.isFinite(value.snoozedAt)?value.snoozedAt:0};}catch{return {exportedAt:0,snoozedAt:0};}}
function write(value:Checkpoint){try{localStorage.setItem(KEY,JSON.stringify(value));window.dispatchEvent(new Event(EVENT));return true;}catch{return false;}}
export function recordBackup(exportedAt:number){return write({exportedAt,snoozedAt:0});}
export function backupDue({exportedAt,snoozedAt,completed,photos,changed,oldest,now=Date.now()}:{exportedAt:number;snoozedAt:number;completed:number;photos:number;changed:boolean;oldest:number;now?:number}){
  return changed&&(!snoozedAt||now-snoozedAt>=WEEK)&&(completed>=5||photos>=10||!!(exportedAt||oldest)&&now-(exportedAt||oldest)>=WEEK);
}
export function useBackupStatus(){
  const [checkpoint,setCheckpoint]=useState(read),[data,setData]=useState({completed:0,photos:0,changed:false,oldest:0});
  useEffect(()=>{const update=()=>setCheckpoint(read());window.addEventListener(EVENT,update);window.addEventListener('storage',update);window.addEventListener('focus',update);return()=>{window.removeEventListener(EVENT,update);window.removeEventListener('storage',update);window.removeEventListener('focus',update);};},[]);
  useEffect(()=>{const sub=liveQuery(async()=>{const [sessions,entries,photos,mistakes,critical,csAnswers,csPhotos]=await Promise.all([db.sessions.toArray(),db.entries.toArray(),db.photos.toArray(),db.mistakes.toArray(),db.criticalAttempts.toArray(),db.csAnswers.toArray(),db.csAnswerPhotos.toArray()]);const times=[...csAnswers.map(a=>a.updatedAt),...csPhotos.map(p=>p.createdAt),...critical.map(x=>x.updatedAt),...sessions.map(x=>x.updatedAt),...entries.map(x=>x.updatedAt),...photos.map(x=>x.createdAt),...mistakes.map(x=>x.updatedAt)];return {completed:sessions.filter(s=>!s.archived&&s.completedAt&&s.completedAt>checkpoint.exportedAt).length+critical.filter(a=>a.submittedAt&&a.submittedAt>checkpoint.exportedAt).length,photos:[...photos,...csPhotos].filter(p=>p.createdAt>checkpoint.exportedAt).length,changed:times.some(t=>t>checkpoint.exportedAt),oldest:times.length?Math.min(...times):0};}).subscribe({next:setData,error:()=>{}});return()=>sub.unsubscribe();},[checkpoint.exportedAt]);
  return {...checkpoint,...data,due:backupDue({...checkpoint,...data}),snooze:()=>{const value={...read(),snoozedAt:Date.now()};if(!write(value))setCheckpoint(value);}};
}
export function BackupReminder({open}:{open:()=>void}){const status=useBackupStatus();if(!status.due)return null;return <div className="backup-reminder" role="status"><div><strong>记得备份最近的学习记录</strong><p>{status.exportedAt?'上次导出后':'当前浏览器中'}新增 {status.completed} 次完成训练、{status.photos} 张图片。{status.exportedAt?`上次导出：${new Date(status.exportedAt).toLocaleString('zh-CN')}`:'尚无备份导出记录。'}</p></div><div className="button-row"><button className="secondary" onClick={open}>前往备份</button><button className="text-button" onClick={status.snooze}>7 天后提醒</button></div></div>;}
