import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const pdfRoot='public/s2-written/downloads';
const pdfManifest=JSON.parse(await readFile(pdfRoot+'/parts/manifest.json','utf8'));
for(const pdf of pdfManifest){const bytes=Buffer.concat(await Promise.all(pdf.parts.map(name=>readFile(pdfRoot+'/parts/'+name))));if(createHash('sha256').update(bytes).digest('hex')!==pdf.sha256)throw Error('PDF integrity check failed: '+pdf.name);await writeFile(pdfRoot+'/'+pdf.name,bytes);}
const repository=process.env.GITHUB_REPOSITORY?.split('/')[1]??'bbbbp';
const base=`/${repository}/`;
for(const args of [['node_modules/typescript/bin/tsc','-b'],['node_modules/vite/bin/vite.js','build','--base',base,'--outDir','output/pages']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
const config=await readFile('public/cloud-config.js','utf8');
await writeFile('output/pages/cloud-config.js',config.replace('enabled:false','enabled:true'));
await writeFile('output/pages/.nojekyll','');
console.log('GitHub Pages build ready at output/pages; local dist is unchanged.');
