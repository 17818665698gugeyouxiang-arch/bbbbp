import {assetUrl} from './site-config';
import {useState,useEffect} from 'react';
import {BookOpen,Maximize2,ChevronDown} from 'lucide-react';
import {Modal} from './media';
import './s2-reference.css';
import normal from './normal-table.json';
import tables from '../public/s2-reference/tables.json';
import {binomialGroups} from './critical';
const pages={binomial:tables.binomial.map(p=>p.bookPage),poisson:tables.poisson.map(p=>p.bookPage),normal:[0]};
type Kind=keyof typeof pages;
function initial(){try{const v=JSON.parse(localStorage.getItem('study-s2-reference')??'{}');return {kind:v.kind==='poisson'||v.kind==='normal'?v.kind as Kind:'binomial' as Kind,page:Math.max(0,Math.min(4,Number(v.page)||0)),zoom:[80,100,125,150].includes(v.zoom)?v.zoom:100};}catch{return {kind:'binomial' as Kind,page:0,zoom:100};}}
export function S2HomeLookup(){
 const [kind,setKind]=useState<Kind>();
 return <><section className="s2-home-lookup" aria-label="主页统计查表"><div><h2><BookOpen size={18}/>统计查表</h2><p>直接查阅分布表，无需开始训练。</p></div><div className="reference-home-buttons">{(['binomial','poisson','normal'] as const).map(k=><button className="secondary" key={k} onClick={()=>setKind(k)}>{k==='binomial'?'Binomial':k==='poisson'?'Poisson':'Normal'}</button>)}</div></section>{kind&&<S2Reference key={kind} lookupKind={kind} onLookupClose={()=>setKind(undefined)}/>}</>;
}
export function S2Reference({lookupKind,onLookupClose}:{lookupKind?:Kind;onLookupClose?:()=>void}={}){
 const [view,setView]=useState(()=>({...initial(),...(lookupKind?{kind:lookupKind}:{})})),[expanded,setExpanded]=useState(!!lookupKind),[mobileOpen,setMobileOpen]=useState(false);
 const [failed,setFailed]=useState(false);
 const kind=view.kind,page=kind==='binomial'?view.page:0,bookPage=pages[kind][page];
 const title=kind==='binomial'?'Binomial 二项分布表':kind==='poisson'?'Poisson 泊松分布表':'Normal 正态分布表';
 const src=assetUrl(`/s2-reference/${kind}-${bookPage}.webp`);
 useEffect(()=>{try{localStorage.setItem('study-s2-reference',JSON.stringify(view));}catch{}},[view]);
 useEffect(()=>setFailed(false),[src]);
 function controls(large=false){return <><div className="reference-tabs" role="group" aria-label={large?'放大统计表类型':'统计表类型'}>{(['binomial','poisson','normal'] as const).map(k=><button key={k} aria-pressed={kind===k} className={kind===k?'selected':''} onClick={()=>setView(v=>({...v,kind:k}))}>{k==='binomial'?'Binomial':k==='poisson'?'Poisson':'Normal'}</button>)}</div><div className="reference-controls"><label>页码<select aria-label={large?'放大统计表页码':'统计表页码'} value={page} disabled={kind!=='binomial'} onChange={e=>setView(v=>({...v,page:Number(e.target.value)}))}>{pages[kind].map((p,i)=><option value={i} key={p}>{kind==='normal'?'z = 0.00–3.99':"书第 "+p+" 页"+(kind==='binomial'?" · n="+binomialGroups[i].join(','):'')}</option>)}</select></label><label>缩放<select aria-label={large?'放大统计表缩放':'统计表缩放'} value={view.zoom} onChange={e=>setView(v=>({...v,zoom:Number(e.target.value)}))}>{[80,100,125,150].map(z=><option key={z} value={z}>{z}%</option>)}</select></label></div></>;}
 function image(){return <div className="reference-table-scroll" role="region" aria-label={title+'，可横向和纵向滚动'} tabIndex={0}>{kind==='normal'?<table className="normal-reference-table" style={{width:`${960*view.zoom/100}px`,fontSize:`${15*view.zoom/100}px`}} aria-label="标准正态分布累计概率表"><caption>Φ(z) = P(Z ≤ z), Z ~ N(0, 1)</caption><thead><tr><th scope="col">z</th>{normal.columns.map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{normal.rows.map(row=><tr key={row.z}><th scope="row">{row.z}</th>{row.values.map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table>:failed?<p className="field-error">统计表加载失败，请刷新页面重试。</p>:<img src={src} alt={`${title}，S2 教材第 ${bookPage} 页`} style={{width:`${960*view.zoom/100}px`}} onError={()=>setFailed(true)} draggable={false}/>}</div>;}
 const modal=expanded&&<Modal title={title} close={()=>{setExpanded(false);onLookupClose?.();}}><div className="reference-zoom-body">{controls(true)}<p className="reference-hint">{kind==='normal'?'Φ(z) = P(Z ≤ z) · 负值用 Φ(−z) = 1 − Φ(z)':'表中数值为 P(X ≤ x)'} · 可滚动查看，Esc 关闭。</p>{image()}</div></Modal>;
 if(lookupKind)return modal;
 return <section className="s2-reference" aria-label="S2 统计表"><div className="reference-heading"><h3><BookOpen size={16}/>统计表</h3><button className="reference-mobile-toggle text-button" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(v=>!v)}>{mobileOpen?'收起':'展开'}<ChevronDown size={14}/></button><button className="text-button" onClick={()=>setExpanded(true)} aria-label="放大统计表"><Maximize2 size={15}/>放大</button></div><div className={'reference-body'+(mobileOpen?' mobile-open':'')}>{controls()}<p className="reference-hint">{kind==='normal'?'Φ(z) = P(Z ≤ z) · 负值用 Φ(−z) = 1 − Φ(z)':'表中数值为 P(X ≤ x) · 滚动查看各列'}</p>{image()}<p className="reference-source">{kind==='normal'?'标准正态分布累计概率 · 保留四位小数':<>S2 教材 · 第 {bookPage} 页</>}</p></div>{modal}</section>;
}
