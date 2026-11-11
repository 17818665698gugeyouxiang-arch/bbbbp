// Writes only to explicitly named, pre-existing QA accounts. No personal records.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const config=await readFile('public/cloud-config.js','utf8'),url=config.match(/url:'([^']+)/)[1],key=config.match(/key:'([^']+)/)[1];
const accounts=JSON.parse(await readFile('tmp/qa/cloud/test-accounts.json','utf8'));assert.ok(accounts.every(a=>a.email.startsWith('study-qa-')));
const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),a=client(),b=client(),device=client();
for(const [c,acc]of [[a,accounts[0]],[b,accounts[1]],[device,accounts[0]]]){const r=await c.auth.signInWithPassword(acc);assert.equal(r.error,null);}
const state=await a.rpc('study_get');assert.equal(state.error,null);const data=structuredClone(state.data.data),id=randomUUID(),now=Date.now(),paperId='ukcho-2026-round1',questionIds=[1,2,3,4,5].map(n=>paperId+'-q'+n),questionId=questionIds[0],mid='mistake:'+questionId,eid=randomUUID(),pid=randomUUID();
data.sessions.push({id,paperId,questionIds,startedAt:now,submittedAt:now,completedAt:now,updatedAt:now,position:0,markingPosition:4,done:questionIds,grades:Object.fromEntries(questionIds.map(q=>[q,{score:'1',wrong:q===questionId,note:'UKChO QA'}]))});
const existing=data.mistakes.find(m=>m.id===mid);if(existing){existing.sessionIds.push(id);existing.updatedAt=now;}else data.mistakes.push({id:mid,paperId,questionId,sessionIds:[id],mastered:false,createdAt:now,updatedAt:now});
data.entries.push({id:eid,mistakeId:mid,sessionId:id,kind:'work',note:'UKChO cloud QA',createdAt:now,updatedAt:now});
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64'),object=accounts[0].user+'/'+encodeURIComponent(pid);
assert.equal((await a.storage.from('study-photos').upload(object,bytes,{contentType:'image/png'})).error,null);
data.photos.push({id:pid,entryId:eid,name:'ukcho-qa.png',rotation:0,createdAt:now,mime:'image/png',hash:createHash('sha256').update(bytes).digest('hex')});
const saved=await a.rpc('study_put',{expected_revision:state.data.revision,incoming:data});assert.equal(saved.error,null,saved.error?.message);
const recovered=await device.rpc('study_get');assert.equal(recovered.error,null);assert.ok(recovered.data.data.sessions.some(s=>s.id===id));assert.ok(recovered.data.data.photos.some(p=>p.id===pid));
const image=await device.storage.from('study-photos').download(object);assert.equal(image.error,null);assert.ok(Buffer.from(await image.data.arrayBuffer()).equals(bytes));assert.ok((await b.storage.from('study-photos').download(object)).error);
const stranger=await b.rpc('study_get');assert.ok(!stranger.data.data.sessions.some(s=>s.id===id));
const report={passed:true,existingServerAcceptsUKChO:true,secondDevice:true,photoBytes:true,accountIsolation:true,personalDataUntouched:true};await writeFile('output/ukcho/cloud-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await Promise.all([a,b,device].map(c=>c.auth.signOut()));
