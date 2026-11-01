import {describe,it,expect} from 'vitest';
import {backupDue} from './backup-status';
const day=86400000,now=20*day;
const base={exportedAt:19*day,snoozedAt:0,completed:0,photos:0,changed:true,oldest:day,now};
describe('备份提醒条件',()=>{
 it('新增五次训练或十张图片时提醒',()=>{expect(backupDue({...base,completed:4,photos:9})).toBe(false);expect(backupDue({...base,completed:5})).toBe(true);expect(backupDue({...base,photos:10})).toBe(true);});
 it('有变更且满七天才按时间提醒，无数据或无变更不提醒',()=>{expect(backupDue({...base,exportedAt:13*day})).toBe(true);expect(backupDue({...base,exportedAt:13*day,changed:false})).toBe(false);expect(backupDue({...base,exportedAt:0,oldest:0,changed:false})).toBe(false);expect(backupDue({...base,exportedAt:0,oldest:18*day})).toBe(false);expect(backupDue({...base,exportedAt:0})).toBe(true);});
 it('延后七天并在导出后重置',()=>{expect(backupDue({...base,completed:5,snoozedAt:14*day})).toBe(false);expect(backupDue({...base,completed:5,snoozedAt:13*day})).toBe(true);expect(backupDue({...base,exportedAt:now,changed:false})).toBe(false);});
});
