import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
const qa='tmp/qa/grade-boundaries',dir=path.resolve(qa,randomUUID()),origin='http://127.0.0.1:4191';
await mkdir(dir,{recursive:true});
const banks=await Promise.all(['fp1','cs','s2'].map(async s=>JSON.parse(await readFile(`public/${s}-bank.json`,'utf8'))));
const papers=[banks[0].find(p=>p.id==='fp1-2026-06-new'),banks[1].find(p=>p.id==='cs-9618-2025-s-21'),banks[2].find(p=>p.id==='s2-2026-06-a')];
const sessions=papers.map((p,i)=>({id:'grading-qa-'+i,paperId:p.id,questionIds:p.questions.map(q=>q.id),startedAt:Date.now()-60000,submittedAt:Date.now()-1000,position:0,markingPosition:p.questions.length-1,done:[],grades:Object.fromEntries(p.questions.map(q=>[q.id,{score:String(q.maxScore),wrong:false,note:''}])),updatedAt:Date.now()}));
const data={sessions,mistakes:[],entries:[],photos:[],criticalAttempts:[],csAnswers:[],csAnswerPhotos:[],topicAttempts:[]};
await writeFile(path.join(dir,'study-data.json'),JSON.stringify({serverId:randomUUID(),revision:1,data}));
const server=spawn(process.execPath,['scripts/serve.mjs','--port=4191','--data-dir='+dir],{windowsHide:true,stdio:'pipe'});
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 for(let i=0;i<80;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const ctx=await browser.newContext({viewport:{width:1440,height:800}}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 for(const [i,name] of ['FP1 数学','计算机 P2','S2 统计'].entries()){
  await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.paper-boundary').first()).toBeVisible();
  if(i===1){const card=page.locator('.paper-card').filter({has:page.getByRole('button',{name:'开始 2025 May/June · 9618/21',exact:true})});await expect(card).toContainText('P2 官方 A 线');await expect(card).toContainText('A Level A*');}
  await page.getByRole('button',{name:'训练记录',exact:true}).click();await page.locator('.history-list .history-row').first().click();
  const left=page.getByRole('region',{name:'题目独立滚动区'}),right=page.getByRole('region',{name:'答案独立滚动区'});await expect(left).toBeVisible();await expect(right).toBeVisible();
  await left.locator('img').first().evaluate(img=>img.decode());await right.locator('img').first().evaluate(img=>img.decode());
  const l=await left.boundingBox(),r=await right.boundingBox();expect(r.x).toBeGreaterThan(l.x+l.width);expect(Math.abs(l.y-r.y)).toBeLessThan(2);
  for(const region of [left,right])expect(await region.evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
  const before=await right.evaluate(el=>el.scrollTop);await left.evaluate(el=>el.scrollTop=100);expect(await right.evaluate(el=>el.scrollTop)).toBe(before);
  await right.evaluate(el=>el.scrollTop=100);const leftTop=await left.evaluate(el=>el.scrollTop);await right.evaluate(el=>el.scrollTop=200);expect(await left.evaluate(el=>el.scrollTop)).toBe(leftTop);
  await page.screenshot({path:`${qa}/marking-${i}-desktop.png`});
  if(i===0){expect(await right.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await page.getByRole('button',{name:'上一题',exact:true}).click();await expect(page.locator('.marking-question h2')).toContainText('第 8 题');expect(await page.getByRole('region',{name:'答案独立滚动区'}).evaluate(el=>el.scrollTop)).toBe(0);await page.getByRole('button',{name:'保存并进入下一题',exact:true}).click();}
  if(i===1)await expect(left.getByRole('region',{name:'我的原始作答'})).toBeVisible();
  await page.getByRole('button',{name:'完成批改',exact:true}).click();await expect(page.locator('.result-boundaries')).toBeVisible();
  if(i===0)await expect(page.locator('.result-boundaries')).toContainText('69');
  if(i===1){await expect(page.locator('.result-boundaries')).toContainText('49');await expect(page.locator('.result-boundaries')).toContainText('228 / 300');}
  if(i===2)await expect(page.locator('.result-boundaries')).toContainText('67');
  await page.screenshot({path:`${qa}/result-${i}-desktop.png`,fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`${qa}/result-${i}-mobile.png`,fullPage:true});
  await page.locator('.result-row').last().click();const ml=await left.boundingBox(),mr=await right.boundingBox();expect(mr.y).toBeGreaterThan(ml.y+ml.height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${qa}/marking-${i}-mobile.png`,fullPage:true});await page.getByRole('button',{name:'完成批改',exact:true}).click();await page.getByRole('button',{name:'返回题库',exact:true}).click();await page.setViewportSize({width:1440,height:800});
 }
 await page.getByRole('button',{name:'BPhO 物理',exact:true}).click();await expect(page.locator('.paper-boundary').first()).toContainText('Top Gold 参考线');await page.screenshot({path:qa+'/library-desktop.png'});
 expect(errors).toEqual([]);const saved=(await (await fetch(origin+'/api/study')).json()).data;expect(saved.sessions).toHaveLength(3);expect(saved.mistakes).toEqual([]);expect(saved.topicAttempts).toEqual([]);
 await writeFile(qa+'/report.json',JSON.stringify({passed:true,independentScroll:true,desktopMobile:true,results:true,exactVariants:true,errors},null,2));console.log('Grade boundaries and independent grading scroll E2E passed');
}finally{await browser.close();server.kill();}
