import {useEffect,useState,useRef} from 'react';
import {supabase,openedCloudAccount} from './cloud';
import {syncNow} from './local-sync';
export function CloudAccount(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false),[user,setUser]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [changed,setChanged]=useState(false);
 const refreshButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(changed)refreshButton.current?.focus();},[changed]);
 useEffect(()=>{
  if(!supabase)return;
  const subscription=supabase.auth.onAuthStateChange((_event,session)=>{
   // Do not await Auth methods inside the SDK's auth lock.
   setUser(session?.user.email??'');setChanged((session?.user.id??undefined)!==openedCloudAccount);
  }).data.subscription;
  return()=>subscription.unsubscribe();
 },[]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setMessage('');try{
  const result=register?await supabase.auth.signUp({email:email.trim(),password,options:{data:{study_app:'bpho-study'}}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(result.error)throw result.error;setPassword('');if(result.data.session)location.reload();else setMessage('请查收确认邮件，确认后再登录。');
 }catch(e){setMessage(e instanceof Error?e.message:'连接失败，请稍后重试');}finally{setBusy(false);}}
 return <section className="cloud-account" aria-label="云端账号">{changed&&<div className="account-changed" onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();refreshButton.current?.focus();}}} role="alertdialog" aria-modal="true" aria-label="账号状态已变化"><div><h2>账号状态已变化</h2><p>其他页面已登录、退出或切换账号。当前页面已停止云端写入，原记录仍保存在原账号的浏览器空间。</p><button ref={refreshButton} className="primary" onClick={()=>location.reload()}>刷新并打开当前学习空间</button></div></div>}{user?<><div><strong>云端账号 · {user}</strong><p>登录同一账号即可在其他设备继续。本机旧记录请通过“数据与备份”导入 ZIP。</p></div><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{await syncNow(true);const result=await supabase!.auth.signOut({scope:'local'});if(result.error)throw result.error;location.reload();}catch(e){setMessage('尚未退出：'+(e instanceof Error?e.message:'请先导出备份'));setBusy(false);}}}>同步并退出登录</button></>:<details className="account-login"><summary>登录 / 注册</summary><div className="account-login-body"><div><strong>登录后同步到其他设备</strong><p>未登录可练习，记录保存在此浏览器。账号与游客记录分别保存；旧本机记录可用 ZIP 迁移。</p></div><form onSubmit={submit}><label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>密码<input type="password" minLength={8} autoComplete={register?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'正在连接…':register?'注册并登录':'登录'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setMessage('');}}>{register?'已有账号，去登录':'创建账号'}</button></form></div></details>}{message&&<p role="alert" className="field-error">{message}</p>}</section>;
}
