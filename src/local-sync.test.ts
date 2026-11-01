import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const remote=vi.hoisted(()=>({server:{serverId:'qa-sync',revision:0,capabilities:['fp1-topics-v1'],data:{} as any},offline:false,duringSave:undefined as undefined|(()=>Promise<void>)}));
vi.mock('./site-config',()=>({cloudEnabled:true,accountDatabaseName:()=> 'qa-sync-safety-test'}));
vi.mock('./cloud',()=>({cloudUser:async()=>({id:'qa'}),cloudPhoto:vi.fn(),cloudJson:vi.fn(async(url:string,options?:RequestInit)=>{
 if(remote.offline)throw Error('offline');
 if(url.endsWith('/head'))return {serverId:remote.server.serverId,revision:remote.server.revision};
 if(options?.body){const body=JSON.parse(String(options.body));if(body.revision!==remote.server.revision)throw Object.assign(Error('conflict'),{status:409});remote.server={...remote.server,revision:remote.server.revision+1,data:body.data};const edit=remote.duringSave;remote.duringSave=undefined;await edit?.();}
 return structuredClone(remote.server);
})}));
import {db} from './db';
import {emptySnapshot} from './sync-merge';
import {cloudJson} from './cloud';
import {startLocalSync,syncNow} from './local-sync';
let stop:undefined|(()=>void);
beforeEach(async()=>{
 const win=new EventTarget();Object.assign(win,{setTimeout,clearTimeout,setInterval,clearInterval});vi.stubGlobal('window',win);const doc=new EventTarget();Object.assign(doc,{hidden:false});vi.stubGlobal('document',doc);vi.stubGlobal('navigator',{});
 await db.transaction('rw',db.tables,async()=>{for(const t of db.tables)await t.clear();});remote.server={serverId:'qa-sync',revision:0,capabilities:['fp1-topics-v1'],data:emptySnapshot()};remote.offline=false;remote.duringSave=undefined;vi.clearAllMocks();
});
afterEach(()=>{stop?.();stop=undefined;vi.unstubAllGlobals();});
async function ready(){let saved=false;stop=startLocalSync(s=>{if(s.state==='saved')saved=true;});await vi.waitFor(()=>expect(saved).toBe(true));}
describe('sync safety across interrupted saves',()=>{
 it('keeps local records and refuses writes to a server without topic support',async()=>{remote.server.capabilities=[];let offline=false;stop=startLocalSync(s=>{if(s.state==='offline')offline=true;});await vi.waitFor(()=>expect(offline).toBe(true));await expect(syncNow(true)).rejects.toThrow('同步服务需要升级');expect(vi.mocked(cloudJson).mock.calls.filter(c=>c[1]?.body)).toHaveLength(0);});
 it('refuses required synchronization before the controller is ready',async()=>{await expect(syncNow(true)).rejects.toThrow('尚未就绪');});
 it('checks only the revision after an unchanged snapshot was fetched',async()=>{await ready();await syncNow(true);await syncNow(true);const calls=vi.mocked(cloudJson).mock.calls;expect(calls.filter(c=>c[0]==='/api/study'&&!c[1]).length).toBe(1);expect(calls.filter(c=>c[0].endsWith('/head')).length).toBe(2);});
 it('keeps offline edits and uploads them after reconnection',async()=>{await ready();remote.offline=true;await db.criticalAttempts.put({id:'offline-attempt',updatedAt:1} as any);await expect(syncNow(true)).rejects.toThrow('offline');expect(await db.criticalAttempts.get('offline-attempt')).toBeDefined();remote.offline=false;await syncNow(true);expect(remote.server.data.criticalAttempts[0].id).toBe('offline-attempt');});
 it('drains changes made during an upload before allowing required sync to finish',async()=>{await ready();await db.criticalAttempts.put({id:'first',updatedAt:1} as any);remote.duringSave=async()=>{await db.criticalAttempts.put({id:'second',updatedAt:2} as any);};await syncNow(true);expect(remote.server.data.criticalAttempts.map((x:any)=>x.id)).toEqual(['first','second']);});
});
