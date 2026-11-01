export type Crop = { src: string; page: number };
export type Question = { id: string; number: string; title: string; maxScore: number; prompt: Crop[]; answer: Crop[]; source: string; answerSource: string; parts?:string[] };
export const subjects={
 bpho:{label:'BPhO 物理',short:'BPhO',brand:'物理研习室',header:'British Physics Olympiad',detail:'Round 1',color:'#245b47'},
 fp1:{label:'FP1 数学',short:'FP1',brand:'数学研习室',header:'Edexcel Mathematics',detail:'Further Pure 1',color:'#285f99'},
 s2:{label:'S2 统计',short:'S2',brand:'统计研习室',header:'Edexcel Mathematics',detail:'Statistics 2',color:'#285f99'},
 cs:{label:'计算机 P2',short:'CS P2',brand:'计算机研习室',header:'Cambridge Computer Science',detail:'Paper 2',color:'#285f99'},
};
export type Subject = keyof typeof subjects;
export type Paper = { id: string; subject?: Subject; year: number; month?: number; variant?: string; specification?: 'old'|'new'; section?: number; title: string; instructions: string; choose: number; scoreCap: number; questions: Question[]; cover: Crop[]; ready: boolean; note?: string; mutuallyExclusive?: string[][]; legacy?: boolean; markingNotes?: Crop[];syllabusCode?:string;examSeries?:'s'|'w'|'m';insert?:Crop[] };
export const subjectOf = (paper?: Paper): Subject => paper?.subject ?? 'bpho';
export const paperPart = (paper: Paper) => subjectOf(paper)==='cs'?`${paper.examSeries==='s'?'May/June':paper.examSeries==='w'?'Oct/Nov':'Feb/March'} · ${paper.syllabusCode}/${paper.variant}`:subjectOf(paper)!=='bpho'?`${paper.month} 月 · ${subjects[subjectOf(paper)].short}${paper.variant?`（${paper.variant} 卷）`:''}`:`Section ${paper.section}`;
export type Grade = { score: string; wrong: boolean; note: string };
export type Session = { id: string; paperId: string; questionIds: string[]; startedAt: number; submittedAt?: number; completedAt?: number; position: number; markingPosition: number; done: string[]; grades: Record<string, Grade>; updatedAt: number; archived?: boolean };
export type Mistake = { id: string; paperId: string; questionId: string; sessionIds: string[]; manual?: boolean; mastered: boolean; createdAt: number; updatedAt: number };
export type Entry = { id: string; mistakeId: string; sessionId?: string; kind: 'work' | 'correction'; note: string; createdAt: number; updatedAt: number };
export type Photo = { id: string; entryId: string; name: string; blob: Blob; rotation: number; createdAt: number };
export type CSAnswer = {id:string;sessionId:string;questionId:string;partId:string;text:string;updatedAt:number};
export function validScore(value: string, max: number) { return value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max; }
export function elapsed(session: Session, now = Date.now()) { return Math.max(0, (session.submittedAt ?? now) - session.startedAt); }
export function duration(ms: number) { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2,'0')}:${String(Math.floor(s / 60) % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`; }
export function result(session: Session, paper: Paper) { const qs=paper.questions.filter(q=>session.questionIds.includes(q.id)); return { score: Math.min(paper.scoreCap, qs.reduce((v,q)=>v+Number(session.grades[q.id]?.score || 0),0)), max: Math.min(paper.scoreCap,qs.reduce((v,q)=>v+q.maxScore,0)) }; }
export const uid = () => crypto.randomUUID();
export function legacyTarget(paperId:string,questionIds:string[],papers:Paper[]) {
  return papers.find(p=>p.legacy && p.id===paperId+'-legacy' && questionIds.length>0 && questionIds.every(id=>p.questions.some(q=>q.id===id)));
}
