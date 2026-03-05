# 贡献与维护约定

本项目的维护约定用于减少重复文档、保证实现与文档一致、降低后续维护成本。

## 文档分层（必须遵守）

- `.trae/documents/CHANGELOG.md`：写“做了什么、影响面、部署要点”，不写长篇实现细节
- `.trae/documents/ARCHITECTURE.md`：只写“当前真实实现（as-is）”，不要写规划/设想
- `.trae/documents/ROADMAP.md`：只写“未完成/需持续推进的 Backlog”，不写排期
- `.trae/documents/FEATURE-SPECS.md`：写功能规格与验收要点；算法不要在此重复
- `.trae/documents/训练助手-算法说明.md`：算法权威来源（公式/边界/样例/验证）
- `.trae/documents/ALGORITHMS.md`：算法目录与维护约定

## 单一事实来源（关键规则）

- 同一算法/规则只允许有一个“权威文档”。其它文档只能链接或给一句话摘要。
- 如果实现与文档不一致：优先修正文档以匹配代码现状；若实现确实要变更，则同步修改实现与权威文档。

## 何时更新哪些文档

- 合入功能/修复：更新 `CHANGELOG.md`
- 数据模型、云函数职责、调用链有变化：更新 `ARCHITECTURE.md`
- 未来计划调整或新增待办：更新 `ROADMAP.md`
- 新功能准备落地（或已落地需补齐规格）：更新 `FEATURE-SPECS.md`
- 算法/口径变更：只更新算法权威文档，并在 `CHANGELOG.md` 记录“口径变更影响”

## 旧文档处理

- 历史全文统一放在 `.trae/documents/ARCHIVE/`
- 旧文件原路径保留“跳转说明”，不要在旧文件继续更新内容

