# 分数线与批改对照

批改页面在电脑上并排显示原题和答案，各自滚动；计算机的原始作答位于题目区域下方。手机上下排列，保留两个独立滚动区域。切题后从顶部开始，评分、照片和批改进度沿用原有保存流程。

分数线清单位于 `src/grade-boundaries.json`，按原试卷 ID 精确关联，未改动数据库、记录、同步协议及备份格式。查阅官方资料的日期为 2026-11-02。`runtime/node.exe scripts/audit-grade-boundaries.mjs` 可生成逐卷来源和覆盖报告 `output/boundaries/audit.json`。

| 科目 | 试卷数 | 已核验 | 转载参考 | 暂无可用线 |
| --- | ---: | ---: | ---: | ---: |
| FP1 | 27 | 26 | 0 | 1 |
| S2 | 11 | 11 | 0 | 0 |
| 计算机 P2 | 39 | 36 | 0 | 3 |
| BPhO Section | 32 | 2 | 18 | 12 |

## Pearson FP1 / S2

主页显示 90 UMS 对应的整数卷面分；不是卷面分的 90%。S2 使用官方 a* 单元边界，常规卷和 A 卷分别匹配。FP1 为 AS 单元，90 UMS 只是学习目标，不存在单元 A* 等级。

2021–2026 数据来自 Pearson 官网换分器公开数据。2014–2020 FP1 使用官方场次分数表的 A–E 数据，依官方 UMS 规则换算：A–B 直线延伸至 100 UMS；延伸超出卷面满分时，将 A 点连接至满分／100 UMS。按官方换分器的四舍五入方式，求能达到至少 90 UMS 的最低整数原始分。保留各原始换算点，测试同时验证该分数达到目标、少一分达不到目标。

- [官方换分器](https://qualifications.pearson.com/en/support/support-topics/results-certification/understanding-marks-and-grades/converting-marks-points-and-grades.html)
- [官方 UMS 换算说明，第 2 页](https://qualifications.pearson.com/content/dam/pdf/Support/Grade-statistics/A-level/UMS%28Uniform-Mark-Scheme%29-Awarding-for-Modular-GCE-%28C2000%29.pdf#page=2)
- FP1 2021 年六月采用学校评估，没有常规考试分数线；不借用其他年份。

## Cambridge P2

显示对应课程代码、年份、场次、卷号的官方 A–E 边界。P2 单卷没有 A*；整套 A Level A* 参考仅选择同场次官方 AX／AY／AZ 表及 2026 新版线性评估表中包含本卷号的四卷组合，显示组成和满分 300，不除以四，也不与 P2 得分直接比较。

2021 年十一月 23 卷没有官方列出的同场次完整组合，明确提示查阅实际报考组合。2020 年六月场次取消，没有考试分数线。2020 年十一月及部分早期资料使用考试局原始 PDF 的存档副本，页面注明来源性质。

## BPhO

整场 Round 1 分数线仅供 Section 训练参考，不把 Section 得分自动合成为全年成绩，不判断奖项。满分按该年的试卷规则显示：2012–2016 为 80 分，2010–2011、2017–2025 为 100 分。

- 2016：ASDAN 中国区原始报告，Top Gold 70／80。
- 2017–2025：仅取得公开转载，界面明确标记“参考线”，附实际来源，未标为官方核验。2024 年转载有 58 分整数区间及 57.5 分临界口径，说明两种口径，半分成绩以官方结果为准。
- 2010–2015：未取得可核验分数线，显示“暂未核验”，不填零，不套用相邻年份。

FP1 跨卷专项没有对应的整卷分数线，成绩页不显示整卷等级比较。

## 验证

- `runtime/node.exe node_modules/vitest/vitest.mjs run`
- `runtime/node.exe scripts/audit-grade-boundaries.mjs`
- `runtime/node.exe scripts/e2e-grade-boundaries.mjs`：使用独立端口及临时数据目录，不写入个人记录；核查桌面左右滚动、切题复位、手机上下布局、三科保存及成绩页分数线、BPhO 参考提示。
