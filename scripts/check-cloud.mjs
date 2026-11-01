// Live private-cloud checks using clearly named QA accounts, never personal records.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const config=await readFile('public/cloud-config.js','utf8'),url=config.match(/url:'([^']+)/)[1],key=config.match(/key:'([^']+)/)[1];
const options={auth:{persistSession:false,autoRefreshToken:false}},client=()=>createClient(url,key,options);
const accounts=[];
for(let i=0;i<2;i++){
 const email=`study-qa-${randomUUID()}@example.com`,password=randomUUID()+randomUUID();
 const c=client(),r=await c.auth.signUp({email,password,options:{data:{study_app:'bpho-study'}}});if(r.error)throw r.error;assert.ok(r.data.session,'Email confirmation must be completed for the QA account');accounts.push({c,user:r.data.user.id,email,password});
}
const [a,b]=accounts;
const first=await a.c.rpc('study_get');if(first.error)throw first.error;
let state=first.data;assert.equal(state.revision,0);
const data=structuredClone(state.data);const id='qa-'+randomUUID();
data.criticalAttempts.push({id,question:{distribution:'binomial',n:20,p:0.3,rule:'normal',tail:'upper',sig:0.05},startedAt:Date.now(),updatedAt:Date.now(),lower:'',upper:''});
let save=await a.c.rpc('study_put',{expected_revision:state.revision,incoming:data});if(save.error)throw save.error;
assert.equal(save.data.revision,1);
const concurrent=await a.c.rpc('study_put',{expected_revision:0,incoming:data});assert.ok(concurrent.error?.message.includes('STUDY_CONFLICT'));
const removing=await a.c.rpc('study_put',{expected_revision:1,incoming:state.data});assert.ok(removing.error?.message.includes('cannot be removed'));
const other=await b.c.from('study_states').select('user_id');assert.deepEqual(other.data,[]);
const stranger=client();const noLogin=await stranger.rpc('study_get');assert.ok(noLogin.error);
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64');
const object=`${a.user}/qa-${randomUUID()}.png`;
const up=await a.c.storage.from('study-photos').upload(object,bytes,{contentType:'image/png',upsert:false});if(up.error)throw up.error;
const download=await a.c.storage.from('study-photos').download(object);if(download.error)throw download.error;assert.ok(Buffer.from(await download.data.arrayBuffer()).equals(bytes));
assert.ok((await b.c.storage.from('study-photos').download(object)).error);
assert.ok((await stranger.storage.from('study-photos').download(object)).error);
const secondDevice=client();assert.equal((await secondDevice.auth.signInWithPassword({email:a.email,password:a.password})).error,null);
assert.equal((await secondDevice.rpc('study_get')).data.data.criticalAttempts[0].id,id);
const report={passed:true,revisionConflict:true,deletionProtected:true,accountsIsolated:true,guestDenied:true,photosPrivate:true,photoBytes:true,secondDevice:true,qaAccounts:accounts.map(x=>x.email),at:new Date().toISOString()};
await mkdir('tmp/qa/cloud',{recursive:true});await writeFile('tmp/qa/cloud/live-report.json',JSON.stringify(report,null,2));
// QA credentials stay in an ignored local fixture for browser verification only.
await writeFile('tmp/qa/cloud/test-accounts.json',JSON.stringify(accounts.map(({user,email,password})=>({user,email,password}))),{mode:0o600});
for(const {c} of accounts)await c.auth.signOut();await secondDevice.auth.signOut();
console.log(JSON.stringify({...report,qaAccounts:accounts.length}));
