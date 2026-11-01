import {describe,expect,it,vi} from 'vitest';
import {cloudRequestFetch,guardStudyRequest} from './cloud-security';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const jwt=(id:string)=>'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:id}))+'.signature';
describe('account binding at actual dispatch',()=>{
 it('rejects an account switch for both database and photo requests before sending',async()=>{
  const transport=vi.fn();const request=cloudRequestFetch(a,transport);
  for(const path of ['/rest/v1/rpc/study_put','/storage/v1/object/study-photos/x'])await expect(request('https://x.supabase.co'+path,{headers:{authorization:'Bearer '+jwt(b)}})).rejects.toThrow('账号状态');
  expect(transport).not.toHaveBeenCalled();
 });
 it('allows refresh tokens for the same account and normal Auth login requests',()=>{
  expect(()=>guardStudyRequest('https://x.supabase.co/rest/v1/rpc/study_get','Bearer '+jwt(a),a)).not.toThrow();
  expect(()=>guardStudyRequest('https://x.supabase.co/auth/v1/token','Bearer public-key',undefined)).not.toThrow();
 });
 it('rejects anonymous, malformed and guest-bound study requests',()=>{
  for(const token of [null,'Bearer broken','Bearer '+jwt(a)])expect(()=>guardStudyRequest('https://x.supabase.co/rest/v1/rpc/study_get',token,undefined)).toThrow();
 });
 it('passes a bounded and cancellable signal to the network',async()=>{
  const transport=vi.fn().mockResolvedValue(new Response('{}'));const stop=new AbortController();
  await cloudRequestFetch(a,transport)('https://x.supabase.co/rest/v1/rpc/study_get',{headers:{authorization:'Bearer '+jwt(a)},signal:stop.signal});
  const signal=transport.mock.calls[0][1].signal;expect(signal.aborted).toBe(false);stop.abort();expect(signal.aborted).toBe(true);
 });
});
