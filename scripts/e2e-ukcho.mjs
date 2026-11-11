import {chromium,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const origin=process.env.UKCHO_TEST_ORIGIN??'http://127.0.0.1:4189';
const server=process.env.UKCHO_TEST_ORIGIN?undefined:spawn(process.execPath,['scripts/serve.mjs','--port=4189','--data-dir=tmp/ukcho/qa-'+Date.now()],{windowsHide:true,stdio:'ignore'});
for(let i=0;i<30;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
const bank=JSON.parse(await readFile('public/ukcho-bank.json','utf8'));
await mkdir('tmp/ukcho/qa',{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
try{
 const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.getByRole('button',{name:'UKChO 化学',exact:true}).click();await expect(page.locator('.paper-card')).toHaveCount(13);await expect(page.locator('.paper-card').filter({hasText:'undefined'})).toHaveCount(0);
 await page.screenshot({path:'tmp/ukcho/qa/library-desktop.png',fullPage:false});
 await page.getByRole('button',{name:'搜题',exact:true}).click();await page.getByLabel('搜题年份',{exact:true}).selectOption('2026');await expect(page.getByLabel('搜题月份')).toHaveCount(0);await expect(page.getByLabel('搜题 Section')).toHaveCount(0);
 await page.getByLabel('搜题题号',{exact:true}).selectOption('ukcho-2026-round1-q2');await page.getByRole('button',{name:'查看题目',exact:true}).click();await expect(page.locator('.search-answer img').first()).toBeVisible();
 await page.getByLabel('搜题年份',{exact:true}).selectOption('2025');await expect(page.getByLabel('搜题题号')).toHaveValue('ukcho-2025-round1-q2');await page.reload();await expect(page.getByLabel('搜题题号')).toHaveValue('ukcho-2025-round1-q2');
 await page.getByRole('button',{name:'真题题库',exact:true}).click();await page.getByRole('button',{name:'开始 2026 Round 1',exact:true}).click();await page.getByRole('button',{name:'开始训练',exact:true}).click();
 await expect(page.locator('.focus-exit')).toBeVisible();await expect(page.locator('.answer-panel')).toHaveCount(0);await expect(page.getByRole('heading',{name:'第 1 题',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'下一题',exact:true}).click();await expect(page.getByRole('heading',{name:'第 2 题',exact:true})).toBeVisible();
 await page.locator('.question-templates summary').click();await expect(page.locator('.question-templates img').first()).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'继续训练',exact:true}).click();await expect(page.getByRole('heading',{name:'第 2 题',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'整场交卷',exact:true}).click();await page.getByRole('button',{name:'确认交卷',exact:true}).click();
 await expect(page.locator('.marking-question')).toBeVisible();await expect(page.locator('.marking-comparison .answer-panel')).toBeVisible();
 await page.getByRole('region',{name:'题目独立滚动区',exact:true}).evaluate(e=>e.scrollTop=120);expect(await page.getByRole('region',{name:'答案独立滚动区',exact:true}).evaluate(e=>e.scrollTop)).toBe(0);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/ukcho/qa/marking-mobile.png',fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.setViewportSize({width:1440,height:1000});
 await page.getByLabel('快捷得分',{exact:true}).fill('999');await expect(page.getByRole('button',{name:'保存并进入下一题'})).toBeDisabled();
 await page.getByLabel('快捷得分',{exact:true}).fill('3.5');await page.getByLabel('快捷错题收录',{exact:true}).check();await expect(page.locator('.upload-block')).toHaveCount(2);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64');
 await page.locator('.upload-block input[type=file]').first().setInputFiles({name:'ukcho-work.png',mimeType:'image/png',buffer:png});await expect(page.locator('.photo-preview')).toHaveCount(1);
 await page.screenshot({path:'tmp/ukcho/qa/marking-desktop.png',fullPage:false});
 await page.getByRole('button',{name:'保存并进入下一题',exact:true}).click();await expect(page.getByRole('heading',{name:/第 2 题 · 题目/})).toBeVisible();await page.reload();await page.getByRole('button',{name:'继续批改',exact:true}).click();await expect(page.getByRole('heading',{name:/第 2 题 · 题目/})).toBeVisible();
 for(let n=2;n<=5;n++){await expect(page.getByRole('heading',{name:new RegExp(`第 ${n} 题 · 题目`)})).toBeVisible();await page.getByLabel('快捷得分',{exact:true}).fill('1');await expect(page.getByLabel('快捷得分',{exact:true})).toHaveValue('1');await page.getByRole('button',{name:n===5?'完成批改':'保存并进入下一题',exact:true}).click();}
 await expect(page.locator('.result-boundaries')).toContainText('Gold');await expect(page.locator('.result-boundaries')).toContainText('38');
 await page.getByRole('button',{name:'返回题库',exact:true}).click();
 await expect(page.locator('.paper-best').filter({hasText:'7.5'})).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:'tmp/ukcho/qa/library-mobile.png',fullPage:false});
 const second=await browser.newContext(),other=await second.newPage();await other.goto(origin);await other.getByRole('button',{name:'UKChO 化学',exact:true}).click();await expect(other.locator('.paper-best').filter({hasText:'7.5'})).toHaveCount(1,{timeout:30000});await other.getByRole('button',{name:/我的错题/}).click();await expect(other.locator('.mistake-card')).toHaveCount(1);await second.close();
 for(const [name,file]of [['BPhO 物理','bank'],['FP1 数学','fp1-bank'],['S2 统计','s2-bank'],['计算机 P2','cs-bank']]){const count=JSON.parse(await readFile(`public/${file}.json`,'utf8')).filter(p=>!p.legacy).length;await page.getByRole('button',{name,exact:true}).click();await expect(page.locator('.paper-card')).toHaveCount(count);await expect(page.locator('.paper-best').filter({hasText:'7.5'})).toHaveCount(0);}
 expect(errors).toEqual([]);await writeFile('tmp/ukcho/qa/e2e-report.json',JSON.stringify({passed:true,checks:['13 years','year-question search','search persistence','answers visible in search','answers hidden in training','full question templates','question navigation','refresh recovery','score validation','photo upload','marking recovery','result boundaries','highest score','mobile layout','cross-browser records'],errors},null,2));console.log('PASS UKChO browser workflow');
}finally{await browser.close();server?.kill();}
