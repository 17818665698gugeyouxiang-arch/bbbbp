import {describe,it,expect} from 'vitest';
import {scoredAttempts} from './score-stats';
import {type Paper,type Session} from './model';
const paper={id:'s2-a',year:2026,subject:'s2',scoreCap:75,questions:[{id:'q1',maxScore:50},{id:'q2',maxScore:50}]} as Paper;
const session=(id:string,score:string,extra:Partial<Session>={}):Session=>({id,paperId:paper.id,questionIds:['q1','q2'],startedAt:100,submittedAt:200,completedAt:300,position:0,markingPosition:0,done:[],grades:{q1:{score,wrong:false,note:''},q2:{score:'40',wrong:false,note:''}},updatedAt:300,...extra});
describe('主界面成绩统计',()=>{
 it('保留每次重复训练并按训练本地时间来源时间戳排序，保留小数和原卷封顶',()=>{
  const rows=scoredAttempts([paper],[session('late','50',{startedAt:500}),session('early','10.5')]);
  expect(rows.map(r=>[r.session.id,r.score,r.max])).toEqual([['early',50.5,75],['late',75,75]]);
 });
 it('未交卷、未批改、无效得分及旧版记录不计入，零分仍是有效成绩',()=>{
  const zero=session('zero','0');zero.grades.q2.score='0';
  const rows=scoredAttempts([paper,{...paper,id:'legacy',legacy:true}],[zero,session('pending','50',{completedAt:undefined}),session('active','50',{submittedAt:undefined}),session('archived','50',{archived:true}),session('invalid',''),session('over','51'),session('legacy','50',{paperId:'legacy'}),session('other','50',{paperId:'fp1-a'})]);
  expect(rows.map(r=>[r.session.id,r.score])).toEqual([['zero',0]]);
 });
 it('相同年份不同卷别和科目按精确 ID 关联，批改修改后立即重算',()=>{
  const other={...paper,id:'fp1-a',subject:'fp1'} as Paper;
  const record=session('edit','10');
  expect(scoredAttempts([other],[record])).toEqual([]);
  expect(scoredAttempts([paper],[record])[0].score).toBe(50);
  record.grades.q1.score='12.5';
  expect(scoredAttempts([paper],[record])[0].score).toBe(52.5);
 });
});
