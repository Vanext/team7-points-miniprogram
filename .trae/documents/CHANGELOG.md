# 变更日志（Changelog）

本文件汇总已合入的主要功能与修复，强调“发生了什么、影响哪些模块、部署注意事项”。实现细节与算法请移步专题文档。

## 2026-01-22

### 服装发放：一键复制快递信息
- 服装发放管理卡片右下角新增“复制”按钮，复制姓名/手机号/地址到剪贴板
- 云函数 `adminManageApparel` 兼容 `recipientName/recipientMobile/recipientAddress` 字段输入，并在列表结果中补充 `recipient*` 回传，确保字段一致可用
- 影响范围：`pages/admin/apparel/apparel`、`cloudfunctions/adminManageApparel`

## 2025-11-29

### 归档与回滚保障（简版）
- 覆盖范围：前端 `pages/*`、`app.js/app.wxss`；后端 `cloudfunctions/*`；数据库结构 `db-schema/*`
- 环境一致性：云函数采用 `cloud.DYNAMIC_CURRENT_ENV`，避免硬编码环境 ID
- 索引快照：已包含 `point_records` 的核心复合索引（`status + _openid`、`_openid + submitTime`）
- 回滚要点：按归档覆盖前端与云函数；索引按 `db-schema/indexes/*.json` 检查并恢复

## 2025-11-24

### 训练排行榜（月度）逻辑优化
- 数据源优先级：优先 `users.trainingStats.byMonth[monthKey]`，缺失时回退聚合 `point_records` 当月 `status='approved'` 的训练打卡
- 训练打卡识别口径统一：支持多个信号字段识别训练类打卡
- 时长口径统一：优先 `selectedHours`，再退回 `actual_minutes/60`，再退回 `points/2`
- 前端：训练榜支持下拉刷新；积分榜进入页面默认强制拉取云端最新数据（取消缓存路径）
- 后端：审核通过/回退时维护 `users.trainingStats`（总时长、按月、按周）；新增一次性回填云函数 `backfillTrainingStats`
- 影响范围：`getTrainingLeaderboard`、`auditPointRecord`、`backfillTrainingStats`、排行榜页面

## 2025-11-14

### 首页公告与精选开关
- 首页公告支持轮播与圆点指示；首页最多展示 3 条开启“首页展示”的公告
- 公告管理列表支持“首页展示”开关与数量限制校验（最多 3 条）
- 影响范围：`pages/home/home`、`getAnnouncements`、`adminManageAnnouncements`

### 审核页过滤修复（数据隔离）
- 管理员审核页仅显示“打卡上传”类记录，排除兑换/返还/管理员调整等自动通过的记录
- 影响范围：`pages/admin/audit/audit`、`getPointRecords`

### 商品管理与兑换链路增强
- 新增商品表单默认折叠，提升列表可视面积
- 服装商品支持尺码库存；兑换必须选择尺码并按所选尺码扣减库存；取消兑换按尺码回滚库存并写入返还记录
- 商品图片统一使用 `cloud://` 存储路径；前端统一转临时 URL 展示；上下架后清理兑换页缓存并强制刷新
- 影响范围：商品管理/详情/兑换/兑换历史、`adminManageProducts`、`getProducts`、`exchangeProduct`、`adminManageExchange`

### 竞训助手（交互与口径修正）
- 游泳：阈值方法二选一（CSS 与 1000m TT），输入默认值与联动逻辑修复
- 骑行：基于 FTP 的多距离预估；IF 可编辑并实时联动；移除重复区块与说明优化
- 影响范围：训练助手页面与相关计算逻辑

### 样式与兼容清理
- 移除/替换小程序端不受支持的样式能力，清理编译告警

## 2024-12

### 负积分支持
- 支持积分范围：-8000 到 999999
- 负积分用户禁止兑换商品；前端负积分显示为警告状态
- 影响范围：成员管理、兑换流程、积分显示

### 会员兑换锁定机制（含自动解锁）
- 管理员可锁定/解锁会员兑换权限，并记录原因与日志
- 兑换流程增加锁定状态校验
- 可基于“比赛参与”触发自动解锁（逻辑由云函数侧维护）
- 影响范围：`manageExchangeLock`、`exchangeProduct`、`getUserProfile`、`submitPoints`，以及相关管理/用户界面

### 云存储权限修复
- 修复图片临时 URL 生成与缓存策略，增强权限错误处理，解决 403 问题
- 影响范围：图片处理工具与图片展示链路

