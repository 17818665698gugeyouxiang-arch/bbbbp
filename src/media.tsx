import React,{useEffect,useState} from 'react';
import {X} from 'lucide-react';
import {type Question} from './model';

export function QuestionTemplates({question}:{question:Question}){return question.templates?.length?<details className="question-templates"><summary>查看本题官方答题模板（结构图与表格）</summary><Crops crops={question.templates} label={`第 ${question.number} 题官方答题模板`}/></details>:null;}

export function Modal({title,close,children}:{title:string;close:()=>void;children:React.ReactNode}){useEffect(()=>{const fn=(e:KeyboardEvent)=>{if(e.key==='Escape')close();};document.addEventListener('keydown',fn);const prev=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',fn);document.body.style.overflow=prev;};},[close]);return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={close}><X/></button></div>{children}</section></div>;}
export function Crops({crops,label}:{crops:Question['prompt'];label:string}){const [zoom,setZoom]=useState('');return <div className="crops">{crops.map((p,i)=><figure key={p.src}><img src={p.src} alt={`${label}，原卷第 ${p.page} 页，片段 ${i+1}`} loading="lazy" onClick={()=>setZoom(p.src)}/><figcaption>原卷第 {p.page} 页 · 点击放大</figcaption></figure>)}{zoom&&<Modal title={label} close={()=>setZoom('')}><img className="zoom-image" src={zoom} alt={label}/></Modal>}</div>;}
