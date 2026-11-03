import catalog from './grade-boundaries.json';
import type {Paper} from './model';

export type Boundary = {
  paperId:string;
  status:'verified'|'reference'|'unavailable';
  scope:'paper'|'round1';
  maxScore:number;
  target?:{label:string;score:number;derived?:boolean};
  bands:{label:string;score:number}[];
  note:string;
  sources:{title:string;url:string;page?:number;kind:'official'|'reproduction'|'reference'}[];
  qualificationReferences?:{option:string;components:string[];score:number;maxScore:number}[];
};

const boundaries=new Map((catalog.records as Boundary[]).map(row=>[row.paperId,row]));

/** Exact IDs keep separate seasons, syllabuses and A variants separate. */
export function boundaryFor(paper:Pick<Paper,'id'|'year'>):Boundary|undefined {
  if(!paper.year)return undefined;
  return boundaries.get(paper.id);
}

export function boundaryGap(row:Boundary,score:number,max:number):string|undefined {
  if(row.status!=='verified'||row.scope!=='paper'||!row.target||max!==row.maxScore||!Number.isFinite(score)||score<0||score>max)return undefined;
  const delta=Math.round((score-row.target.score)*100)/100;
  return delta===0?`刚好达到 ${row.target.label}`:delta>0?`高于 ${row.target.label} ${delta} 分`:`距 ${row.target.label} 还差 ${-delta} 分`;
}
