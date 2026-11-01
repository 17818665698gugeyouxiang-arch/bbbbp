import {describe,it,expect} from 'vitest';
import bpho from '../public/bank.json';
import legacy from '../public/legacy-bank.json';
import fp1 from '../public/fp1-bank.json';
import s2 from '../public/s2-bank.json';
import {type Paper,type Session,type Entry} from './model';
import {searchablePapers,questionAttempts,legacyAttempts,attemptEntries,changeSearchYear,changeSearchPaper} from './search-model';
const papers=[...bpho,...legacy,...fp1] as Paper[];
const session=(id:string,paperId:string,questionIds:string[],startedAt:number,extra:Partial<Session>={}):Session=>({id,paperId,questionIds,startedAt,position:0,markingPosition:0,done:[],grades:{},updatedAt:startedAt,...extra});
describe('搜题真实题库及历史关联',()=>{
 it('S2 的常规卷及 A 卷使用实际月份与独立题号',()=>{const bank=searchablePapers([...papers,...s2] as Paper[],'s2');expect(bank).toHaveLength(11);expect(bank.reduce((n,p)=>n+p.questions.length,0)).toBe(76);expect(bank.filter(p=>p.year===2026&&p.month===6).map(p=>p.id).sort()).toEqual(['s2-2026-06','s2-2026-06-a']);expect(bank.find(p=>p.id==='s2-2024-06')!.questions.map(q=>q.number)).toEqual(['1','2','3','4','5','6']);for(const p of bank)expect(p.questions.reduce((n,q)=>n+q.maxScore,0)).toBe(75);});
 it('两科独立选项，保留缺答案题目而排除旧整卷',()=>{const b=searchablePapers(papers,'bpho'),m=searchablePapers(papers,'fp1');expect(b).toHaveLength(32);expect(m).toHaveLength(27);expect(b.some(p=>!p.ready)).toBe(true);expect([...b,...m].some(p=>p.legacy)).toBe(false);expect(b.find(p=>p.year===2013&&p.section===2)!.questions[0].number).toBe('1');expect(b.find(p=>p.year===2025&&p.section===2)!.questions[0].number).toBe('2');expect(b.find(p=>p.year===2025&&p.section===1)!.questions.map(q=>q.number)).toEqual('ABCDEFGHIJKLMNOPQR'.split(''));expect(m.filter(p=>p.year===2021).map(p=>p.month).sort((a,b)=>a!-b!)).toEqual([1,6,10]);expect(m.find(p=>p.year===2026&&p.month===1)!.questions).toHaveLength(10);});
 it('按精确试卷和题目关联，包含未交卷与未收录错题的练习，不串月份',()=>{const list=[session('old','fp1-2025-06-new',['q1'],1,{submittedAt:2}),session('jan','fp1-2025-01-new',['q1'],9),session('new','fp1-2025-06-new',['q1'],10),session('wrong-question','fp1-2025-06-new',['q2'],11),session('archive','fp1-2025-06-new',['q1'],12,{archived:true})];expect(questionAttempts(list,'fp1-2025-06-new','q1').map(s=>s.id)).toEqual(['new','old']);expect(questionAttempts(list,'missing','q1')).toEqual([]);expect(list[0].id).toBe('old');});
 it('旧版整卷仅属于对应年份科目及 Section 的相关入口',()=>{const p=papers.find(p=>p.id==='2025-s1')!;const list=[session('legacy','2025-s1-legacy',['2025-s1-q1'],5,{archived:true}),session('other','2024-s1-legacy',['2024-s1-q1'],9,{archived:true})];expect(legacyAttempts(papers,list,p).map(s=>s.id)).toEqual(['legacy']);expect(questionAttempts(list,p.id,p.questions[0].id)).toEqual([]);expect(legacyAttempts(papers,list,papers.find(p=>p.subject==='fp1')!)).toEqual([]);});
 it('过程按训练分组，后续订正独立，排序不改变原数组',()=>{const entry=(id:string,createdAt:number,sessionId?:string):Entry=>({id,mistakeId:'mistake:q1',kind:'correction',note:'',createdAt,updatedAt:createdAt,...(sessionId?{sessionId}:{})});const entries=[entry('a2',3,'a'),entry('later',5),entry('b',4,'b'),entry('a1',1,'a')];expect(attemptEntries(entries,'a').map(e=>e.id)).toEqual(['a1','a2']);expect(attemptEntries(entries).map(e=>e.id)).toEqual(['later']);expect(entries[0].id).toBe('a2');});
});

describe('搜索选择沿用',()=>{
 it('BPhO 年份切换保留 Section 和真实字母题，结果指向新年份',()=>{
  const c={year:'2025',paperId:'2025-s1',questionId:'2025-s1-a',resultQuestionId:'2025-s1-a'};
  const next=changeSearchYear(c,papers,'2024');expect(next).toEqual({year:'2024',paperId:'2024-s1',questionId:'2024-s1-a',resultQuestionId:'2024-s1-a'});
 });
 it('S2 同场次优先沿用 A 卷和数字题，缺少该题时清空题号',()=>{
  const bank=s2 as Paper[],a=bank.find(p=>p.id==='s2-2026-06-a')!;
  const c={year:'2026',paperId:a.id,questionId:a.questions[6].id,resultQuestionId:a.questions[6].id};
  const next=changeSearchYear(c,bank,'2025');expect(next.paperId).toBe('s2-2025-06');expect(next.questionId).toBe('s2-2025-06-q7');
  const missing=changeSearchYear(c,bank,'2024');expect(missing.paperId).toBe('s2-2024-06');expect(missing.questionId).toBe('');expect(missing.resultQuestionId).toBe('');
  const october=bank.find(p=>p.id==='s2-2025-10-a')!;expect(changeSearchPaper(c,bank,october).questionId).toBe(october.questions[6].id);
 });
});
