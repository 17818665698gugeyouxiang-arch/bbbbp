// Authenticate using the user's existing OS credential manager. Never print tokens.
import {spawnSync} from 'node:child_process';
const owner='17818665698gugeyouxiang-arch',name='bbbbp',repo=`${owner}/${name}`;
const c=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
if(c.status)throw Error('GitHub credential manager is not signed in');
const values=Object.fromEntries(c.stdout.trim().split('\n').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
async function api(route,method='GET',body){const r=await fetch('https://api.github.com'+route,{method,headers:{Authorization:'Bearer '+values.password,'User-Agent':'bpho-study-deploy','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const data=await r.json().catch(()=>({}));return {status:r.status,data};}
const mode=process.argv[2]??'status';
if(mode==='create'){
 let r=await api('/repos/'+repo);if(r.status===404)r=await api('/user/repos','POST',{name,description:'真题研习室 · BPhO / FP1 / S2 / Computer Science P2',private:false,auto_init:false});
 if(![200,201].includes(r.status))throw Error(JSON.stringify({status:r.status,message:r.data.message}));
 console.log(JSON.stringify({repository:r.data.html_url,defaultBranch:r.data.default_branch,size:r.data.size}));
}else if(mode==='pages'){
 let r=await api('/repos/'+repo+'/pages');r=await api('/repos/'+repo+'/pages',r.status===404?'POST':'PUT',{build_type:'workflow'});
 console.log(JSON.stringify({status:r.status,message:r.data.message,url:r.data.html_url}));if(![200,201,204].includes(r.status))process.exitCode=1;
}else{
 const runs=await api('/repos/'+repo+'/actions/runs?per_page=3');console.log(JSON.stringify({status:runs.status,runs:runs.data.workflow_runs?.map(r=>({id:r.id,status:r.status,conclusion:r.conclusion,url:r.html_url,sha:r.head_sha}))}));
 const pages=await api('/repos/'+repo+'/pages');console.log(JSON.stringify({pages:pages.status,url:pages.data.html_url,status:pages.data.status,build:pages.data.build_type}));
}
