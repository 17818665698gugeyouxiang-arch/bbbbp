import {useEffect,useState} from 'react';
import {supabase} from './cloud';
import {syncNow} from './local-sync';
export function CloudAccount(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[register,setRegister]=useState(false),[user,setUser]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{void supabase?.auth.getSession().then(({data})=>setUser(data.session?.user.email??''));},[]);
 async function submit(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setMessage('');try{
  const result=register?await supabase.auth.signUp({email:email.trim(),password,options:{data:{study_app:'bpho-study'}}}):await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(result.error)throw result.error;setPassword('');if(result.data.session)location.reload();else setMessage('请查收确认邮件，确认后再登录。');
 }catch(e){setMessage(e instanceof Error?e.message:'连接失败，请稍后重试');}finally{setBusy(false);}}
 return <section className="cloud-account" aria-label="云端账号">{user?<><div><strong>云端账号 · {user}</strong><p>登录同一账号即可在其他设备继续。本机旧记录请通过“数据与备份”导入 ZIP。</p></div><button className="secondary" disabled={busy} onClick={async()=>{setBusy(true);setMessage('');try{await syncNow(true);await supabase!.auth.signOut({scope:'local'});location.reload();}catch(e){setMessage('尚未退出：'+(e instanceof Error?e.message:'请先导出备份'));setBusy(false);}}}>同步并退出登录</button></>:<><div><strong>登录后同步到其他设备</strong><p>未登录可练习，记录保存在此浏览器。账号与游客记录分别保存；旧本机记录可用 ZIP 迁移。</p></div><form onSubmit={submit}><label>邮箱<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>密码<input type="password" minLength={8} autoComplete={register?'new-password':'current-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'正在连接…':register?'注册并登录':'登录'}</button><button type="button" className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setMessage('');}}>{register?'已有账号，去登录':'创建账号'}</button></form></>}{message&&<p role="alert" className="field-error">{message}</p>}</section>;
}
