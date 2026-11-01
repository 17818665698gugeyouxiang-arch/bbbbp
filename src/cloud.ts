import {createClient} from '@supabase/supabase-js';
import {cloudConfig,cloudEnabled,cloudStorageKey,accountDatabaseName} from './site-config';
import {cloudRequestFetch} from './cloud-security';
const openedAccount=accountDatabaseName().replace('bpho-study-v1-cloud-','');
export const openedCloudAccount=openedAccount==='bpho-study-v1'?undefined:openedAccount;
export const supabase=cloudEnabled&&cloudConfig?createClient(cloudConfig.url,cloudConfig.key,{global:{fetch:cloudRequestFetch(openedCloudAccount)},auth:{storageKey:cloudStorageKey,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}}):undefined;
export async function cloudUser(){const user=(await supabase?.auth.getSession())?.data.session?.user;if(user&&user.id!==openedAccount)throw Error('账号已变更，请刷新页面打开对应的学习空间。原记录已保留');return user;}
function failure(e:{message:string;code?:string}){return Object.assign(Error(e.message.includes('STUDY_CONFLICT')?'另一台设备刚刚保存了修改，正在重新合并':e.message.includes('STUDY_CLIENT_UPGRADE')?'请刷新网站后再同步，旧版页面无法安全保存专项记录。':e.message),{status:e.message.includes('STUDY_CONFLICT')?409:400});}
export async function cloudJson(url:string,options?:RequestInit){
 if(!supabase)throw Error('云服务未配置');
 const user=await cloudUser();if(!user)throw Error('请先登录账号，浏览器中的记录仍保留');
 if(url==='/api/study/head'){
  const {data,error}=await supabase.rpc('study_head');if(error)throw failure(error);return data;
 }
 if(url==='/api/study'){
  const body=options?.body?JSON.parse(String(options.body)):undefined;
  const {data,error}=await supabase.rpc(body?'study_put':'study_get',body?{expected_revision:body.revision,incoming:body.data}:{});
  if(error)throw failure(error);return data;
 }
 if(url.startsWith('/api/photos/')&&options?.method==='PUT'){
  const id=decodeURIComponent(url.slice('/api/photos/'.length));
  const blob=options.body as Blob;
  const {error}=await supabase.storage.from('study-photos').upload(`${user.id}/${encodeURIComponent(id)}`,blob,{contentType:blob.type,upsert:false});
  if(error&&String((error as any).statusCode)!=='409')throw failure(error);
  // A duplicate object is accepted only after independently verifying its bytes.
  const actual=error?await cloudPhoto(id):await blob.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',actual))].map(b=>b.toString(16).padStart(2,'0')).join('');return {hash};
 }
 throw Error('未知的云同步操作');
}
export async function cloudPhoto(id:string){
 if(!supabase)throw Error('云服务未配置');const user=await cloudUser();if(!user)throw Error('请先登录');
 const {data,error}=await supabase.storage.from('study-photos').download(`${user.id}/${encodeURIComponent(id)}`);if(error)throw failure(error);return data.arrayBuffer();
}
