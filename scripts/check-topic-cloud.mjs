import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const config=await readFile('public/cloud-config.js','utf8'),url=config.match(/url:'([^']+)/)[1],key=config.match(/key:'([^']+)/)[1];
const accounts=JSON.parse(await readFile('tmp/qa/cloud/test-accounts.json','utf8'));
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),a=client(),b=client();
for(const [c,acc] of [[a,accounts[0]],[b,accounts[1]]]){const r=await c.auth.signInWithPassword(acc);assert.equal(r.error,null);}
let state=(await a.rpc('study_get')).data;assert.ok(state.capabilities.includes('fp1-topics-v1'));
const id=randomUUID(),now=Date.now(),qid='fp1-2025-06-new-q8',other='fp1-2024-06-new-q6';
const topic={id,kind:'fp1-topics',years:[2024,2025],topics:['induction'],refs:[{paperId:'fp1-2025-06-new',questionId:qid},{paperId:'fp1-2024-06-new',questionId:other}],questionIds:[qid,other],startedAt:now,updatedAt:now,position:0,markingPosition:0,done:[],grades:{}};
async function save(data,expectError){const r=await a.rpc('study_put',{expected_revision:state.revision,incoming:data});if(expectError){assert.ok(r.error,expectError);return r;}assert.equal(r.error,null,r.error?.message);state=r.data;return r;}
await save({...state.data,topicAttempts:[...state.data.topicAttempts,topic]});
const collision=structuredClone(state.data);collision.sessions.push({id:randomUUID(),paperId:'fp1-2025-06-new',questionIds:[qid],startedAt:now,updatedAt:now,position:0,markingPosition:0,done:[],grades:{}});assert.match((await save(collision,'active guard')).error.message,/one active/i);
const mutated=structuredClone(state.data);mutated.topicAttempts.find(a=>a.id===id).refs.reverse();await save(mutated,'immutable/references');
const next=structuredClone(state.data),t=next.topicAttempts.find(x=>x.id===id);t.submittedAt=now+1000;t.updatedAt=now+1000;t.markingPosition=1;t.grades[qid]={score:'12.5',wrong:true,note:'FP1 topic QA'};t.grades[other]={score:'9',wrong:false,note:''};t.completedAt=now+1000;
const mid='mistake:'+qid;let mistake=next.mistakes.find(m=>m.id===mid);if(!mistake){mistake={id:mid,paperId:'fp1-2025-06-new',questionId:qid,sessionIds:[],mastered:false,createdAt:now,updatedAt:now};next.mistakes.push(mistake);}mistake.sessionIds.push(id);mistake.updatedAt=now+1000;
const eid=id+':'+qid+':work',pid='qa-topic-'+randomUUID(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64');
assert.equal((await a.storage.from('study-photos').upload(accounts[0].user+'/'+encodeURIComponent(pid),bytes,{contentType:'image/png'})).error,null);
next.entries.push({id:eid,mistakeId:mid,sessionId:id,kind:'work',note:'Topic process',createdAt:now,updatedAt:now});next.photos.push({id:pid,entryId:eid,name:'topic.png',rotation:0,createdAt:now,mime:'image/png',hash:createHash('sha256').update(bytes).digest('hex')});await save(next);
const legacy=structuredClone(state.data);delete legacy.topicAttempts;assert.match((await save(legacy,'old client guard')).error.message,/STUDY_CLIENT_UPGRADE/);
const removed=structuredClone(state.data);removed.topicAttempts=removed.topicAttempts.filter(a=>a.id!==id);assert.match((await save(removed,'deletion protection')).error.message,/cannot be removed/);
const otherState=(await b.rpc('study_get')).data;assert.ok(!otherState.data.topicAttempts.some(t=>t.id===id));assert.ok((await b.storage.from('study-photos').download(accounts[0].user+'/'+encodeURIComponent(pid))).error);
const decimal=structuredClone(state.data);decimal.topicAttempts.find(t=>t.id===id).grades[qid].score='.5';await save(decimal);decimal.topicAttempts.find(t=>t.id===id).grades[qid].score='1e-7';await save(decimal);decimal.topicAttempts.find(t=>t.id===id).grades[qid].score='12.5';await save(decimal);
const again=await a.rpc('study_put',{expected_revision:state.revision,incoming:state.data});assert.equal(again.error,null);assert.equal(again.data.revision,state.revision);
const device=client();assert.equal((await device.auth.signInWithPassword(accounts[0])).error,null);const recovered=(await device.rpc('study_get')).data;assert.equal(recovered.data.topicAttempts.find(t=>t.id===id).grades[qid].score,'12.5');
const report={passed:true,capability:true,activeGuard:true,immutableQuestions:true,topicMistakePhotos:true,legacyWriteBlocked:true,deletionProtected:true,accountIsolation:true,secondDevice:true,idempotent:true};await mkdir('tmp/qa/fp1-topics',{recursive:true});await writeFile('tmp/qa/fp1-topics/cloud-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await Promise.all([a,b,device].map(c=>c.auth.signOut()));
