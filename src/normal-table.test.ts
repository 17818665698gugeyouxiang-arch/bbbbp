import {describe,it,expect} from 'vitest';
import table from './normal-table.json';
describe('standard normal cumulative table',()=>{
 it('包含常用已知概率，并使用左尾累计概率',()=>{expect(table.rows[0].values[0]).toBe('0.5000');expect(table.rows[10].values[0]).toBe('0.8413');expect(table.rows[12].values[8]).toBe('0.8997');expect(table.rows[16].values[4]).toBe('0.9495');expect(table.rows[19].values[6]).toBe('0.9750');expect(table.rows[23].values[3]).toBe('0.9901');expect(table.rows[30].values[9]).toBe('0.9990');});
 it('覆盖 0.00 至 3.99，所有累计概率单调且四位小数',()=>{expect(table.rows).toHaveLength(40);const values=table.rows.flatMap(r=>r.values);expect(values).toHaveLength(400);values.forEach((v,i)=>{expect(v).toMatch(/^\d\.\d{4}$/);expect(Number(v)).toBeGreaterThanOrEqual(i?Number(values[i-1]):0.5);expect(Number(v)).toBeLessThanOrEqual(1);});});
});
