import tables from '../public/s2-reference/tables.json';
export type Distribution='binomial'|'poisson';
export type CriticalRule='normal'|'closest';
export type Tail='lower'|'upper'|'two';
export type CriticalQuestion={distribution:Distribution;n?:number;p?:number;lambda?:number;rule:CriticalRule;tail:Tail;sig:number};
export type CriticalAttempt={id:string;question:CriticalQuestion;startedAt:number;submittedAt?:number;updatedAt:number;lower:string;upper:string;correct?:boolean};
export const binomialGroups=[[5,6,7,8,9,10],[12,15,20],[25,30],[40],[50]];
export const binomialNs=binomialGroups.flat();
const EPS=1e-11;
export function tableSource(q:CriticalQuestion){return q.distribution==='poisson'?tables.poisson[0].src:tables.binomial[binomialGroups.findIndex(group=>group.includes(q.n!))].src;}
export function distributionText(q:CriticalQuestion){return q.distribution==='binomial'?`X ~ B(${q.n}, ${q.p})`:`X ~ Po(${q.lambda})`;}
export function probabilities(q:CriticalQuestion){
 const values:number[]=[];
 if(q.distribution==='binomial'){
  let mass=(1-q.p!)**q.n!;values.push(mass);
  for(let k=1;k<=q.n!;k++){mass*=((q.n!-k+1)/k)*(q.p!/(1-q.p!));values.push(mass);}
 }else{
  let mass=Math.exp(-q.lambda!);values.push(mass);
  for(let k=1;k<=100;k++){mass*=q.lambda!/k;values.push(mass);}
 }
 return values;
}
export function criticalSolution(q:CriticalQuestion,rounded=false){
 const pmf=probabilities(q),cdf:number[]=[];let sum=0;
 for(const v of pmf){sum+=v;cdf.push(Math.min(1,sum));}
 const target=q.sig/(q.tail==='two'?2:1),round=(p:number)=>rounded?Math.round(p*10000)/10000:p;
 const lowerProb=(k:number)=>k<0?0:cdf[k]??1,upperProb=(k:number)=>k>=cdf.length?0:Math.max(0,1-(cdf[k-1]??0));
 function pick(tail:'lower'|'upper'){
  // Only non-empty critical regions within the distribution's support.
  const candidates=pmf.map((_,k)=>({k,prob:tail==='lower'?round(lowerProb(k)):round(upperProb(k))}));
  if(q.rule==='normal'){
   const valid=candidates.filter(c=>c.prob<=target+EPS);
   if(!valid.length)return [];
   return [tail==='lower'?valid[valid.length-1].k:valid[0].k];
  }
  // Include the empty tail when deciding closeness, then reject such questions.
  const all=[...candidates,{k:tail==='lower'?-1:pmf.length,prob:0}];
  const distance=Math.min(...all.map(c=>Math.abs(c.prob-target)));
  return all.filter(c=>Math.abs(Math.abs(c.prob-target)-distance)<EPS).map(c=>c.k);
 }
 return {lower:q.tail==='upper'?[]:pick('lower'),upper:q.tail==='lower'?[]:pick('upper'),target,lowerProb,upperProb};
}
export function checkCritical(q:CriticalQuestion,lower:string,upper:string){
 const s=criticalSolution(q),integer=(v:string)=>/^\d+$/.test(v.trim());
 return (q.tail==='upper'||integer(lower)&&s.lower.includes(Number(lower)))&&(q.tail==='lower'||integer(upper)&&s.upper.includes(Number(upper)));
}
export function usableQuestion(q:CriticalQuestion){
 const exact=criticalSolution(q),rounded=criticalSolution(q,true);
 const same=(a:number[],b:number[])=>a.length===b.length&&a.every((v,i)=>v===b[i]);
 return (q.tail==='upper'||exact.lower.length>0&&exact.lower.every(k=>k>=0))&&(q.tail==='lower'||exact.upper.length>0&&exact.upper.every(k=>k<probabilities(q).length))&&same(exact.lower,rounded.lower)&&same(exact.upper,rounded.upper)&&(q.tail!=='two'||Math.max(...exact.lower)<Math.min(...exact.upper));
}
const pool=new Map<string,CriticalQuestion[]>();
export function generateCritical(distribution:Distribution,rule:CriticalRule,random= Math.random,settings:Partial<Pick<CriticalQuestion,'tail'|'sig'>>={}):CriticalQuestion{
 const choose=<T,>(a:T[])=>a[Math.min(a.length-1,Math.floor(random()*a.length))];
 const tail=settings.tail??choose<Tail>(['lower','upper','two']),sig=settings.sig??choose([.05,.10]);
 if(!['lower','upper','two'].includes(tail)||![.05,.1].includes(sig))throw Error('请选择有效的尾部和显著性水平。');
 const key=[distribution,rule,tail,sig].join(':');
 if(!pool.has(key)){
  const params=distribution==='binomial'?binomialNs.flatMap(n=>Array.from({length:10},(_,i)=>({n,p:(i+1)/20}))):Array.from({length:20},(_,i)=>({lambda:(i+1)/2}));
  pool.set(key,params.map(p=>({distribution,rule,tail,sig,...p})).filter(usableQuestion));
 }
 const candidates=pool.get(key)!;if(!candidates.length)throw Error('没有符合条件的题目，请更换设置。');
 return {...choose(candidates)};
}
export function validCriticalAttempt(a:unknown):a is CriticalAttempt{
 if(!a||typeof a!=='object')return false;
 const r=a as CriticalAttempt,q=r.question;
 if(typeof r.id!=='string'||!r.id||r.id.length>500||!q||!['binomial','poisson'].includes(q.distribution)||!['normal','closest'].includes(q.rule)||!['lower','upper','two'].includes(q.tail)||![.05,.1].includes(q.sig))return false;
 if(q.distribution==='binomial'&&(!binomialNs.includes(q.n!)||!Array.from({length:10},(_,i)=>(i+1)/20).includes(q.p!)))return false;
 if(q.distribution==='poisson'&&(!(q.lambda!>=.5&&q.lambda!<=10)||!Number.isInteger(q.lambda!*2)))return false;
 if(!Number.isFinite(r.startedAt)||r.startedAt<=0||!Number.isFinite(r.updatedAt)||r.updatedAt<r.startedAt||typeof r.lower!=='string'||typeof r.upper!=='string'||r.lower.length>20||r.upper.length>20||!usableQuestion(q))return false;
 return r.submittedAt===undefined?r.correct===undefined:Number.isFinite(r.submittedAt)&&r.submittedAt>=r.startedAt&&typeof r.correct==='boolean'&&r.correct===checkCritical(q,r.lower,r.upper);
}
