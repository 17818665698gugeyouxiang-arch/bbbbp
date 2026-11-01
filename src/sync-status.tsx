import {useEffect,useState} from 'react';
import {startLocalSync,syncNow,type SyncStatus} from './local-sync';
import {cloudEnabled} from './site-config';
import {CloudAccount} from './cloud-account';
export function SyncStatusBar({ready}:{ready:boolean}){
 const [status,setStatus]=useState<SyncStatus>({state:'working',message:cloudEnabled?'正在连接个人云端…':'正在连接本机共享数据…'});
 useEffect(()=>{if(ready)return startLocalSync(setStatus);},[ready]);
 return <div className="workspace-tools">{cloudEnabled&&<CloudAccount/>}<section className={'sync-status sync-'+status.state} aria-label={cloudEnabled?'云端同步':'本机同步'} aria-live="polite"><div><strong>{status.state==='saved'?(status.message.startsWith('游客模式')?'游客模式 · 仅此浏览器':cloudEnabled?'云端已同步':'本机已同步'):status.state==='working'?'正在同步':status.state==='conflict'?'需要处理同步冲突':'同步暂未完成'}</strong><p>{status.message}{status.at?' · '+new Date(status.at).toLocaleTimeString('zh-CN'):''}</p>{status.conflicts&&<p>同一项得分、笔记或状态在两边都有修改。选择仅处理冲突部分，其他内容继续合并。两份版本均已保留恢复副本。</p>}</div><div className="button-row">{status.state==='conflict'?<><button className="secondary" onClick={()=>void syncNow(false,'local')}>保留此浏览器的冲突修改</button><button className="secondary" onClick={()=>void syncNow(false,'remote')}>使用共享的冲突修改</button></>:status.state==='offline'?<button className="secondary" onClick={()=>void syncNow()}>重试同步</button>:null}</div></section></div>;
}
