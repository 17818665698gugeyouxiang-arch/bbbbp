import {describe,it,expect} from 'vitest';
import {boundaryFor,boundaryGap} from './grade-boundaries';
import data from './grade-boundaries.json';
import bpho from '../public/bank.json';
import fp1 from '../public/fp1-bank.json';
import s2 from '../public/s2-bank.json';
import cs from '../public/cs-bank.json';

const get=(id:string,year=2026)=>boundaryFor({id,year})!;

describe('精确场次的分数线与成绩比较',()=>{
  it('覆盖所有现有试卷，区分已核验、转载参考和无可用分数线',()=>{
    const papers=[...bpho,...fp1,...s2,...cs];
    expect(data.records).toHaveLength(papers.length);
    expect(new Set(data.records.map(r=>r.paperId)).size).toBe(papers.length);
    for(const p of papers){
      const r=get(p.id,p.year);
      expect(r).toBeDefined();
      expect(r.sources.length).toBeGreaterThan(0);
      for(const source of r.sources)expect(source.url).toMatch(/^https:\/\//);
      if(r.status==='unavailable')expect(r.target).toBeUndefined();
      else{
        expect(r.target!.score).toBeGreaterThan(0);
        expect(r.target!.score).toBeLessThanOrEqual(r.maxScore);
        if(r.scope==='paper')expect(r.maxScore).toBe(p.scoreCap);
      }
    }
  });
  it('S2 常规卷和 A 卷用各自的官方 90 UMS 边界',()=>{
    expect(get('s2-2026-01').target!.score).toBe(67);
    expect(get('s2-2026-01-a').target!.score).toBe(66);
    expect(get('s2-2026-06').target!.score).toBe(68);
    expect(get('s2-2026-06-a').target!.score).toBe(67);
  });
  it('FP1 依据官方换算曲线及封顶点求 90 UMS，不把它当成 90% 原始分',()=>{
    expect(get('fp1-2025-06-new').target).toEqual({label:'90 UMS',score:70,derived:true});
    expect(get('fp1-2026-06-new').target!.score).toBe(69);
    expect(get('fp1-2014-01-old').target!.score).toBe(68);
    for(const row of data.records.filter(r=>r.paperId.startsWith('fp1-')&&r.status==='verified')){
      const points=row.conversion!.points.filter(p=>p.grade!=='Max Mark').sort((a,b)=>a.raw-b.raw);
      const convert=(raw:number)=>{
        const cap=points.find(p=>p.grade==='Cap')!;
        if(raw>=cap.raw)return cap.ums;
        const i=points.findIndex((p,i)=>i<points.length-1&&p.raw<=raw&&raw<=points[i+1].raw),l=points[i],r=points[i+1];
        return Math.round(l.ums+(raw-l.raw)*(r.ums-l.ums)/(r.raw-l.raw));
      };
      expect(convert(row.target!.score)).toBeGreaterThanOrEqual(90);
      expect(convert(row.target!.score-1)).toBeLessThan(90);
    }
  });
  it('CIE 显示 P2 A 线，A* 仅为包含本卷号的实际整套组合',()=>{
    const r=get('cs-9618-2025-s-21');
    expect(r.target).toEqual({label:'P2 官方 A 线',score:49});
    expect(r.bands.some(b=>b.label==='A*')).toBe(false);
    expect(r.qualificationReferences).toEqual([{option:'AX',components:['11','21','31','41'],score:228,maxScore:300}]);
    expect(get('cs-9618-2025-s-23').target!.score).toBe(62);
    expect(get('cs-9618-2025-s-23').qualificationReferences![0].score).toBe(240);
    for(const row of data.records.filter(r=>r.paperId.startsWith('cs-')&&r.status==='verified')){
      const variant=row.paperId.split('-').at(-1)!;
      for(const reference of row.qualificationReferences??[])expect(reference.components).toContain(variant);
    }
    expect(get('cs-9618-2021-w-23').qualificationReferences).toEqual([]);
    expect(get('cs-9618-2026-s-21').qualificationReferences![0].score).toBe(240);
    expect(get('cs-9618-2026-s-23').qualificationReferences![0].score).toBe(250);
  });
  it('停考和未知试卷不借用其他年份，专项组卷不套用整卷线',()=>{
    expect(get('fp1-2021-06-new').status).toBe('unavailable');
    expect(get('cs-9608-2020-s-21').status).toBe('unavailable');
    expect(boundaryFor({id:'fp1-topic-view',year:0})).toBeUndefined();
    expect(boundaryFor({id:'fp1-2099-06-new',year:2099})).toBeUndefined();
  });
  it('BPhO 按实际年份的 Round 1 总分显示，不能用 Section 得分判奖',()=>{
    const r=get('2016-s1',2016);
    expect(r.maxScore).toBe(80);
    expect(r.target!.score).toBe(70);
    expect(get('2025-s1',2025).status).toBe('reference');
    expect(get('2025-s1',2025).maxScore).toBe(100);
    expect(get('2010-s1',2010).status).toBe('unavailable');
    expect(boundaryGap(r,40,40)).toBeUndefined();
  });
  it('比较只针对已核验且同量纲的完整试卷，保留小数得分',()=>{
    const row=get('s2-2026-06');
    expect(boundaryGap(row,67.5,75)).toBe('距 90 UMS 还差 0.5 分');
    expect(boundaryGap(row,68,75)).toBe('刚好达到 90 UMS');
    expect(boundaryGap(row,69.5,75)).toBe('高于 90 UMS 1.5 分');
    expect(boundaryGap(row,40,50)).toBeUndefined();
    expect(boundaryGap(row,NaN,75)).toBeUndefined();
    expect(boundaryGap(get('2025-s1',2025),55,100)).toBeUndefined();
  });
});
