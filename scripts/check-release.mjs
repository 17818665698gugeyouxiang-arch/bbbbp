import {readFile,readdir,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function inspectReleaseFile(name,content=''){
 const errors=[];
 if(/(^|\/)(data|runtime|tmp|node_modules|test-results|backups|\.git)(\/|$)|(^|\/)\.env(?:\.|$)|\.(zip|log|sqlite|db)$|(?:test-accounts|recovery)\./i.test(name))errors.push('private or local-only path');
 if(/sb_secret_[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))errors.push('credential detected');
 for(const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)??[]){try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role==='service_role')errors.push('administrative JWT');}catch{}}
 if(name.endsWith('.json')){try{const v=JSON.parse(content);if(v.format==='bpho-study'||Array.isArray(v.sessions)||Array.isArray(v.data?.sessions))errors.push('personal study snapshot');}catch{}}
 return errors;
}
async function walk(root,prefix=''){const result=[];for(const d of await readdir(root,{withFileTypes:true})){const name=prefix+d.name;if(d.isSymbolicLink())throw Error('Release cannot contain symlinks');if(d.isDirectory())result.push(...await walk(path.join(root,d.name),name+'/'));else result.push(name);}return result;}
export async function checkRelease(mode='source'){
 let files,root;
 if(mode==='source'){const r=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});if(r.status)throw Error('Cannot list release sources');files=r.stdout.split('\0').filter(Boolean);root='.';}
 else{root=mode;files=await walk(root);}
 for(const name of files){const p=path.join(root,name);if((await lstat(p)).isSymbolicLink())throw Error('Symlink '+name);const content=/\.(?:[cm]?js|tsx?|json|html|ya?ml|md|sql|css)$/.test(name)?await readFile(p,'utf8'):'';const errors=inspectReleaseFile(name,content);if(errors.length)throw Error(name+': '+errors.join(', '));}
 console.log(`Release safety passed: ${files.length} ${mode==='source'?'tracked source':'artifact'} files`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await checkRelease(process.argv[2]);
