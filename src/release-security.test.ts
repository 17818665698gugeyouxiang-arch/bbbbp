import {describe,it,expect} from 'vitest';
// @ts-expect-error release tooling is an independent Node module
import {inspectReleaseFile} from '../scripts/check-release.mjs';
describe('public release boundary',()=>{
 it('rejects local records, backups, recovery pages and runtime files',()=>{
  for(const path of ['data/study.json','tmp/test-accounts.json','public/recovery.html','runtime/node.exe','backup.zip','.env.production'])expect(inspectReleaseFile(path)).not.toEqual([]);
  expect(inspectReleaseFile('public/export.json',JSON.stringify({sessions:[]}))).not.toEqual([]);
 });
 it('allows the publishable key but rejects administrative credentials',()=>{
  expect(inspectReleaseFile('public/cloud-config.js','sb_publishable_'+'x'.repeat(40))).toEqual([]);
  expect(inspectReleaseFile('src/oops.ts','sb_secret_'+'x'.repeat(40))).not.toEqual([]);
  const token='eyJ0eXAiOiJKV1QifQ.'+btoa(JSON.stringify({role:'service_role'})).replace(/=+$/, '')+'.signature';expect(inspectReleaseFile('src/oops.ts',token)).not.toEqual([]);
 });
});


