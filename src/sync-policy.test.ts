import {describe,it,expect} from 'vitest';
import {retryDelay,sameRevision} from './sync-policy';
describe('cloud bandwidth and retry policy',()=>{
 it('backs off after failures, bounds retries and polls background tabs less often',()=>{
  expect(retryDelay(0,false)).toBe(15000);expect(retryDelay(1,false)).toBe(30000);expect(retryDelay(20,false)).toBe(120000);expect(retryDelay(20,true)).toBe(240000);
 });
 it('requires both server identity and revision to reuse a cached snapshot',()=>{
  const a={serverId:'one',revision:4};expect(sameRevision(a,{...a})).toBe(true);expect(sameRevision(a,{...a,revision:5})).toBe(false);expect(sameRevision(a,{...a,serverId:'two'})).toBe(false);expect(sameRevision(a,null)).toBe(false);
 });
});
