import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory='public/s2-written/downloads/parts';await mkdir(directory,{recursive:true});const manifest=[];
for(const name of ['questions.pdf','answers.pdf']){const bytes=await readFile('public/s2-written/downloads/'+name),parts=[];for(let i=0;i<bytes.length;i+=512*1024){const file=name+'.'+String(parts.length).padStart(3,'0')+'.bin';await writeFile(directory+'/'+file,bytes.subarray(i,i+512*1024));parts.push(file);}manifest.push({name,parts,sha256:createHash('sha256').update(bytes).digest('hex')});}
await writeFile(directory+'/manifest.json',JSON.stringify(manifest,null,2));console.log('Prepared lossless PDF chunks. Originals remain unchanged.');
