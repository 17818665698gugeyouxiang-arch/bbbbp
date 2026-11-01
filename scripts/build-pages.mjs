import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import path from 'node:path';
import {checkRelease} from './check-release.mjs';
const pdfRoot='public/s2-written/downloads';
const pdfManifest=JSON.parse(await readFile(pdfRoot+'/parts/manifest.json','utf8'));
for(const pdf of pdfManifest){const bytes=Buffer.concat(await Promise.all(pdf.parts.map(name=>readFile(pdfRoot+'/parts/'+name))));if(createHash('sha256').update(bytes).digest('hex')!==pdf.sha256)throw Error('PDF integrity check failed: '+pdf.name);await writeFile(pdfRoot+'/'+pdf.name,bytes);}
const repository=process.env.GITHUB_REPOSITORY?.split('/')[1]??'bbbbp';
const base=`/${repository}/`;
for(const args of [['node_modules/typescript/bin/tsc','-b']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
await build({base,publicDir:false,build:{outDir:'output/pages',emptyOutDir:true}});
const tracked=spawnSync('git',['ls-files','-z','--','public'],{encoding:'utf8'});if(tracked.status)throw Error('Cannot list public assets');
const assets=[...tracked.stdout.split('\0').filter(p=>p&&!p.startsWith(pdfRoot+'/parts/')),...pdfManifest.map(p=>pdfRoot+'/'+p.name)];
for(const src of assets){const dest=path.join('output/pages',src.slice('public/'.length));await mkdir(path.dirname(dest),{recursive:true});await copyFile(src,dest);}
const config=await readFile('public/cloud-config.js','utf8');
const origin=new URL(config.match(/url:'([^']+)'/)[1]);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.supabase.co')||!/key:'sb_publishable_[A-Za-z0-9_-]+'/.test(config))throw Error('Invalid public cloud configuration');
await writeFile('output/pages/cloud-config.js',config.replace('enabled:false','enabled:true'));
const csp=`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' ${origin.origin}; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'`;
const html=await readFile('output/pages/index.html','utf8');await writeFile('output/pages/index.html',html.replace('<head>',`<head><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer">`));
await writeFile('output/pages/.nojekyll','');
await checkRelease('output/pages');
console.log('GitHub Pages build ready at output/pages; local dist is unchanged.');
