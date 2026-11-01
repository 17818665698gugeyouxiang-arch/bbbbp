import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const repository=process.env.GITHUB_REPOSITORY?.split('/')[1]??'bbbbp';
const base=`/${repository}/`;
for(const args of [['node_modules/typescript/bin/tsc','-b'],['node_modules/vite/bin/vite.js','build','--base',base,'--outDir','output/pages']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);
}
const config=await readFile('public/cloud-config.js','utf8');
await writeFile('output/pages/cloud-config.js',config.replace('enabled:false','enabled:true'));
await writeFile('output/pages/.nojekyll','');
console.log('GitHub Pages build ready at output/pages; local dist is unchanged.');
