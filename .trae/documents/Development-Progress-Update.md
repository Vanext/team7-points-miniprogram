# 开发进度更新文档

## 项目概述
本文档记录了团队7积分小程序的所有功能修改和实现进度，包括负积分支持、会员兑换锁定机制、云存储权限修复等核心功能。

## 已实现功能

### 1. 负积分支持 (✅ 已完成)
**实现时间**: 2024年12月
**相关云函数**: `adminManageMembers`, `exchangeProduct`
**修改内容**:
- 支持积分范围：-8000 到 999999
- 负积分用户禁止兑换商品
- 负积分显示为红色警告
- 管理员可设置负积分

**技术实现**:
```javascript
// adminManageMembers/index.js
if (points < -8000 || points > 999999) {
  throw new Error('积分必须在 -8000 到 999999 之间')
}

// exchangeProduct/index.js
if (user.points < 0) {
  throw new Error('积分不足，无法兑换商品')
}
```

**测试文件**: `test_negative_points.js`

### 2. 会员兑换锁定机制 (✅ 已完成)
**实现时间**: 2024年12月
**新增云函数**: `manageExchangeLock`
**相关云函数**: `exchangeProduct`, `getUserProfile`

**功能特性**:
- 管理员手动锁定/解锁会员兑换权限
- 锁定原因记录
- 锁定状态日志追踪
- 兑换时自动检查锁定状态

**云函数接口**:
- `lockUser`: 锁定用户兑换权限
- `unlockUser`: 解锁用户兑换权限
- `getLockStatus`: 获取用户锁定状态
- `getLockLogs`: 获取锁定日志
- `checkAndAutoUnlock`: 检查并自动解锁

**核心代码示例**:
```javascript
// manageExchangeLock/index.js - 锁定用户
const updateData = {
  exchange_locked: true,
  lock_reason: reason,
  locked_at: db.serverDate(),
  locked_by_admin_id: adminUser._id
}

// exchangeProduct/index.js - 兑换检查
if (user.exchange_locked === true) {
  throw new Error('您的兑换权限已被锁定，请联系管理员')
}
```

**测试文件**: `test_exchange_lock.js`

### 3. 自动解锁机制 (✅ 已完成)
**实现时间**: 2024年12月
**相关云函数**: `manageExchangeLock`, `submitPoints`
**触发条件**: 用户参与比赛后自动解锁

**实现逻辑**:
```javascript
// 检查用户是否被锁定且需要自动解锁
if (user.exchange_locked && user.auto_unlock_date === null) {
  // 获取用户当年的比赛参与记录
  const competitionCount = await getUserCompetitionCount(userId, currentYear)
  if (competitionCount > 0) {
    // 自动解锁
    await unlockUser(userId, '参与比赛后自动解锁')
  }
}
```

### 4. 云存储权限修复 (✅ 已完成)
**实现时间**: 2024年12月
**相关文件**: `utils/imageUtils.js`
**问题修复**: 403 Forbidden 错误

**解决方案**:
- 升级到付费云开发版本
- 优化临时URL缓存机制
- 添加权限错误处理
- 支持多种URL格式转换

**技术改进**:
```javascript
// 智能错误处理
if (error.code === 'STORAGE_EXCEED_AUTHORITY') {
  console.warn('云存储权限受限，使用降级方案')
  return getDefaultImageUrl()
}

// 缓存优化
const cacheKey = `temp_url_${cloudUrl}`
const cached = getCache(cacheKey)
if (cached && !isExpired(cached)) {
  return cached.url
}
```

## 云函数更新状态

### 核心云函数修改

| 云函数名称 | 状态 | 修改内容 | API端点 |
|-----------|------|----------|---------|
| `adminManageMembers` | ✅ 完成 | 支持负积分(-8000~999999)，添加锁定状态管理 | `adminManageMembers` |
| `exchangeProduct` | ✅ 完成 | 添加负积分检查和锁定状态验证 | `exchangeProduct` |
| `getUserProfile` | ✅ 完成 | 返回用户锁定状态信息 | `getUserProfile` |
| `manageExchangeLock` | ✅ 新增 | 完整的锁定/解锁管理功能 | `manageExchangeLock` |
| `submitPoints` | ✅ 完成 | 添加比赛参与后的自动解锁逻辑 | `submitPoints` |

### 详细API接口

#### manageExchangeLock 云函数
```javascript
// 锁定用户
cloud.callFunction({
  name: 'manageExchangeLock',
  data: {
    action: 'lockUser',
    data: {
      userId: '用户ID',
      reason: '锁定原因',
      autoUnlockAfterCompetition: true
    }
  }
})

// 解锁用户
cloud.callFunction({
  name: 'manageExchangeLock',
  data: {
    action: 'unlockUser',
    data: {
      userId: '用户ID',
      reason: '解锁原因'
    }
  }
})

// 获取锁定状态
cloud.callFunction({
  name: 'manageExchangeLock',
  data: {
    action: 'getLockStatus',
    data: { userId: '用户ID' }
  }
})
```

### 辅助功能

| 功能模块 | 状态 | 说明 | 相关文件 |
|---------|------|------|----------|
| 图像处理工具 | ✅ 完成 | 支持wxfile://、cloud://、HTTP多种格式 | `utils/imageUtils.js` |
| 管理员界面 | ✅ 完成 | 添加锁定/解锁操作界面 | `pages/admin/members/` |
| 用户界面 | ✅ 完成 | 显示锁定状态和负积分警告 | `pages/profile/` |
| 日志系统 | ✅ 完成 | 完整的锁定操作日志记录 | `exchange_lock_logs`集合 |

## 数据库架构更新

### 新增字段
```javascript
// users集合新增字段
{
  exchange_locked: Boolean,        // 是否锁定兑换权限
  lock_reason: String,             // 锁定原因
  locked_at: Date,                 // 锁定时间
  locked_by_admin_id: String,      // 锁定管理员ID
  auto_unlock_date: Date,          // 自动解锁时间
  competition_participation_count: Number,  // 比赛参与次数
  last_competition_date: Date      // 最后比赛时间
}

// 新增exchange_lock_logs集合
{
  user_id: String,                 // 用户ID
  action: String,                  // lock/unlock
  reason: String,                  // 操作原因
  performed_by_admin_id: String,   // 操作管理员ID
  auto_unlock_after_competition: Boolean,  // 是否比赛后自动解锁
  created_at: Date                 // 操作时间
}
```

## 测试验证

### 测试用例

1. **负积分测试**:
   - ✅ 设置用户积分到-5000
   - ✅ 验证兑换商品被拒绝
   - ✅ 检查负积分显示为红色

2. **锁定机制测试**:
   - ✅ 管理员锁定用户兑换权限
   - ✅ 被锁定用户无法兑换商品
   - ✅ 解锁后恢复正常兑换

3. **自动解锁测试**:
   - ✅ 锁定用户参与比赛
   - ✅ 验证自动解锁触发
   - ✅ 检查解锁日志记录

4. **云存储测试**:
   - ✅ 图片正常加载显示
   - ✅ 临时URL正确生成
   - ✅ 403错误不再出现

### 测试文件列表
- `test_negative_points.js` - 负积分功能测试
- `test_exchange_lock.js` - 兑换锁定功能测试
- `test_images/` - 图片处理测试页面

## 待优化项目

### 性能优化
- [ ] 云函数冷启动优化
- [ ] 数据库查询索引优化
- [ ] 图片缓存策略改进

### 功能增强
- [ ] 批量锁定/解锁功能
- [ ] 锁定状态通知机制
- [ ] 更详细的权限管理

### 监控和日志
- [ ] 错误率监控
- [ ] 性能指标收集
- [ ] 用户行为分析

## 部署说明

所有云函数修改已通过测试，可以安全部署到生产环境。建议在低峰期进行部署，并监控以下指标：

1. 云函数调用成功率
2. 数据库查询性能
3. 图片加载速度
4. 用户反馈

### 部署步骤
```bash
# 1. 部署云函数
cloudbase functions:deploy manageExchangeLock
cloudbase functions:deploy adminManageMembers
cloudbase functions:deploy exchangeProduct
cloudbase functions:deploy getTrainingLeaderboard
cloudbase functions:deploy backfillTrainingStats

# 2. 更新数据库权限
cloudbase database:migration run migrations/add_exchange_lock_fields.js

# 3. 验证部署
node test_negative_points.js
node test_exchange_lock.js
```

## 更新：近期功能与修复汇总 (✅ 已完成)
**日期**: 2025-11-14

**首页与公告**
- 公告轮播增加圆点指示器，随滑动高亮，修复遮挡与层级问题；首页最多展示 3 条开启“首页展示”的公告。
- 公告管理：列表右侧添加“首页展示”开关及说明文字；后端支持 `toggleFeatured` 单项开关，最多 3 条。

**审核与数据隔离**
- 管理员审核页仅显示打卡上传；`getPointRecords` 增加 `isAdmin` 并按 `type` 与 `categoryName` 过滤，排除兑换/返还/调整。

**商品管理与兑换**
- 新增商品表单默认折叠；“新增商品”按钮加大与文案更新。
- 编辑弹层加宽、按钮文字垂直居中；“名称/积分/库存”标签与输入框同行紧凑展示。
- 服装尺码支持 `XS` 并默认启用；兑换必须选择尺码、显示库存并禁用无库存；编辑保存后正确回显。
- 默认商品图片统一为云存储 `cloud://`；前端统一转换临时 URL 显示。
- 下架/上架后清理兑换页缓存并强制刷新。
- 用户自助取消兑换：`adminManageExchange` 新增 `userCancel`，返还积分与回滚库存（含尺码），写入返还记录；移除旧函数。

**竞训助手**
- 页面标题改为“竞训助手”。
- 游泳：阈值方法二选一（`CSS(200/400)` 与 `1000m TT`）；`1000m` 秒未填默认为 0；条件修正（防寒泳衣/跟游/水况）与水平档位联动；下拉切换与输入逻辑修复。
- 骑行：基于 FTP 的 20/40/90/180km 预估；IF 滑块可编辑（60%–100%）并实时联动；删除重复的 40km 预估区块，设定说明移至卡片底部。

**样式与兼容**
- 移除不受支持的 `color-scheme`；替换 `backdrop-filter` 与 `filter: drop-shadow` 为 `box-shadow`，清理编译告警；浅色主题通过变量维持。

**云函数与部署**
- 已登录并使用云开发工具部署更新：`adminManageExchange`、`getPointRecords`、`getAnnouncements`、`getProducts` 等；README 补充 CLI 指引与维护规范。

## 版本信息

- **当前版本**: v2.3.0
- **最后更新**: 2025年11月14日
- **主要功能**: 首页公告与开关、审核过滤强化、商品尺码与图片统一、兑换取消闭环、竞训助手（游泳两种阈值方法与比赛预测、骑行多距离预测与 IF 编辑）、WXSS兼容清理、云函数部署指引
- **下版本计划**: IF 预设模式、游泳 log-log 历史拟合、更多页面的样式与无障碍优化

## 相关文档

- [负积分测试报告](test_negative_points.js)
- [兑换锁定测试报告](test_exchange_lock.js)
- [数据库迁移脚本](migrations/add_exchange_lock_fields.js)
- [图像处理工具文档](utils/imageUtils.js)

---

## 新增：首页公告优化 (✅ 已完成)
**实现时间**: 2025年11月
**相关页面/云函数**: `pages/home/home`, `getAnnouncements`, `adminManageAnnouncements`, `pages/admin/announcements/`

**修改内容**:
- 首页公告显示“类型 · 时间戳”，卡片可左右滑动，支持自动轮播与手动切换；首页滑动展示 3 条精选公告。
- 管理页发布表单默认折叠，点击“新增公告”展开；列表卡片仅显示标题与类型/时间；在卡片右上角提供首页展示开关，最多开启 3 条并实时生效；开关旁添加小字说明“首页展示”。

**技术实现**:
```javascript
// pages/home/home.js
wx.cloud.callFunction({ name: 'getAnnouncements', data: { limit: 3, homeOnly: true } })

// cloudfunctions/getAnnouncements/index.js
const coll = db.collection('announcements')
query = homeOnly ? coll.where({ showOnHome: true }) : coll

// cloudfunctions/adminManageAnnouncements/index.js - 设定首页精选
if (action === 'setFeatured') {
  const { ids = [] } = data
  await coll.where({ showOnHome: true }).update({ data: { showOnHome: false, updateTime: db.serverDate() } })
  for (const id of ids) {
    await coll.doc(id).update({ data: { showOnHome: true, updateTime: db.serverDate() } })
  }
}
```

**页面改动**:
- `home.wxml` 公告区使用 `swiper`；仅在标题旁展示一个类型标签，时间在次行显示；卡片内容增加两行省略，避免文字溢出。
- 去除 `swiper-item` 绝对定位与负向偏移，统一卡片高度与内外边距，保证文本在卡片边界内完整显示；公告区标题与内容间距压缩。
- `admin/announcements` 新增选择与保存按钮，限制 2 条并后端校验。

## 新增：审核页过滤修复 (✅ 已完成)
**实现时间**: 2025年11月
**相关页面/云函数**: `pages/admin/audit/audit`, `getPointRecords`

**问题说明**:
- 兑换成功或取消的历史记录出现在管理员审核页面“已通过”子页面，造成流程混淆。

**解决方案**:
- 审核页仅面向会员打卡上传的积分记录（需要人工审核的提交）。
- 在 `getPointRecords` 增加筛选参数，仅返回“提交类”记录，排除兑换/返还/管理员调整等自动通过的记录。

**技术实现**:
```javascript
// cloudfunctions/getPointRecords/index.js
const _ = db.command
const { status, onlySubmission = true, excludeTypes = ['exchange','refund','adjust'] } = event
const condition = { status }
if (onlySubmission) {
  condition.type = _.nin(excludeTypes)
  condition.categoryName = _.exists(true)
}

// pages/admin/audit/audit.js
wx.cloud.callFunction({
  name: 'getPointRecords',
  data: { status, page, pageSize, isAdmin: true, onlySubmission: true }
})
```

**结果**:
- “待审核/已通过/已拒绝”只显示打卡上传类记录；兑换商品的消耗与取消返还不再混入审核列表，且对缺少 `type` 的老数据也能正确排除（依赖 `categoryName` 存在性）。

**云函数更新状态补充**:

| 云函数名称 | 状态 | 修改内容 | API端点 |
|-----------|------|----------|---------|
| `getAnnouncements` | ✅ 完成 | 支持 `homeOnly` 返回首页精选 | `getAnnouncements` |
| `adminManageAnnouncements` | ✅ 完成 | 新增/扩展 `setFeatured`（最多3条） | `adminManageAnnouncements` |
| `getPointRecords` | ✅ 完成 | 新增 `onlySubmission`，排除 `exchange/refund/adjust` | `getPointRecords` |

## 新增：商品管理页折叠新增表单 (✅ 已完成)
**实现时间**: 2025年11月
**相关页面**: `pages/admin/products/products`

**需求**:
- 默认折叠新增商品表单，仅显示商品列表；点击“新增”按钮再展开表单编辑，以增大列表显示面积。

**实现**:
```javascript
// products.js
data: { showCreateForm: false }
onToggleCreateForm(){ this.setData({ showCreateForm: !this.data.showCreateForm }) }
// 创建成功后折叠并清空表单
this.setData({ form: initialForm, showCreateForm: false })

// products.wxml
<button bindtap="onToggleCreateForm" class="btn btn-primary create-btn">新增商品</button>
<view class="form card" wx:if="{{showCreateForm}}"> ... </view>
```

**结果**:
- 页面初始仅显示商品列表；点击“新增”展开编辑区域；保存后自动折叠并刷新列表。
 - 新增按钮文字为“新增商品”，尺寸加大以提高可见性。

## 修复：尺码库存读取与展示 (✅ 已完成)
**问题**: 前台商品详情未显示尺码选择，编辑保存后再次打开尺码数据缺失。
**原因**: `getProducts` 云函数未返回 `sizeStocks` 字段，导致前台详情缺少尺码库存信息。
**修复**:
```javascript
// cloudfunctions/getProducts/index.js - 字段选择补充
.field({ ..., sizesEnabled: true, sizes: true, sizeStocks: true })
```
**效果**:
- 商品详情按尺码显示库存并禁用无库存尺码；兑换表单内强制选择尺码（服装类）。
 - 新增商品默认开启“服装尺码”开关，便于直接录入尺码库存。

## 修复：首页展示开关“未知操作” (✅ 已完成)
**原因**: 云函数未支持单项切换；页面调用返回“未知操作”。
**修复**:
```javascript
// cloudfunctions/adminManageAnnouncements/index.js
if (action === 'toggleFeatured') { /* 单项开关，最多3条 */ }

// pages/admin/announcements/announcements.js
wx.cloud.callFunction({ name: 'adminManageAnnouncements', data: { action: 'toggleFeatured', data: { id, value } } })
```
**效果**:
- 列表右上角开关即时更新首页展示状态；总数限制为 3 条。
- 首页公告严格按开关控制展示（取消“最新3条”的逻辑）。

## 新增：我的兑换页支持取消 (✅ 已完成)
**页面**: `pages/exchange-history/`
**功能**:
- 在“兑换历史”对待处理（pending）的记录显示“取消兑换”按钮；操作成功后状态更新为“已取消”，积分返还、库存回滚（含尺码库存）。
**后端**:
- 统一使用 `adminManageExchange` 云函数的 `action: 'userCancel'` 分支处理用户自助取消（无需管理员权限）。
- 删除未使用的 `userCancelExchange` 云函数，避免依赖冲突。

## 新增：排行榜与训练统计改动 (✅ 已完成)
**日期**: 2025-11-24

**训练排行榜（月度）逻辑优化**
- 数据源优先级：先读取 `users.trainingStats.byMonth[monthKey]`，缺失时回退聚合 `point_records` 中当月 `status='approved'` 的训练打卡。
- 训练打卡识别信号：`category === 'training' || categoryId === 'training' || formData.category === 'training'`。
- 时长口径统一：优先 `selectedHours`；否则 `actual_minutes/60`；否则 `points/2`，并四舍五入保留两位小数。
- 支持月度值为字符串数字（自动转换为数值）。
- 代码位置：
  - `cloudfunctions/getTrainingLeaderboard/index.js:18-26` 月份解析与 `monthKey`
  - `cloudfunctions/getTrainingLeaderboard/index.js:31-46` 当月兜底聚合（approved）
  - `cloudfunctions/getTrainingLeaderboard/index.js:47-56` 训练信号识别
  - `cloudfunctions/getTrainingLeaderboard/index.js:49-66` 优先 `trainingStats.byMonth[monthKey]`，字符串数值转换与兜底回退
  - `cloudfunctions/getTrainingLeaderboard/index.js:67-77` 排序与排名输出

**前端刷新与排序**
- 训练榜下拉刷新：页面启用 `enablePullDownRefresh`，仅在训练标签触发云端拉取并重新排序。
  - `pages/leaderboard/leaderboard.json:2-4` 启用下拉刷新与背景样式
  - `pages/leaderboard/leaderboard.js:170-174` 按当前标签分别刷新训练/积分榜
  - `pages/leaderboard/leaderboard.js:131-134` 客户端按 `totalTrainingHours` 降序排序
- 积分榜取消缓存并强制刷新：进入页面默认拉取云端最新数据，避免审核后延迟。
  - `pages/leaderboard/leaderboard.js:19-27` `onLoad/onShow` 使用 `fetchLeaderboard(true)`
  - `pages/leaderboard/leaderboard.js:49-51` `checkCacheAndLoad` 改为直接强刷

**UI 改动**
- 标签默认显示为“积分排行榜”。
  - `pages/leaderboard/leaderboard.js:6` 默认 `activeTab: 'points'`
  - `pages/leaderboard/leaderboard.js:61` 无事件参数时默认切到 `points`
- 训练排行榜新增前三名“领奖台样式”展示，样式与积分榜一致，点击跳转个人页。
 - 训练排行榜更名为“月训练排行榜”，标签文案与空状态文案已同步更新。
   - `pages/leaderboard/leaderboard.wxml:18` 标签文本改为“月训练排行榜”
   - `pages/leaderboard/leaderboard.wxml:94` 空状态改为“暂无月训练排行榜数据”
   - `pages/leaderboard/leaderboard.js:136, 140` 错误文案改为“月训练排行榜加载失败”
  - `pages/leaderboard/leaderboard.wxml:68-90` podium 结构（训练榜）
  - 使用现有 podium 样式：`pages/leaderboard/leaderboard.wxss` 的 `.podium-*` 系列
- 积分榜顶部空隙压缩，podium 与列表靠近切换标签：
  - `pages/leaderboard/leaderboard.wxml:100-103` 将积分榜容器与 podium 顶距调整为更紧凑（示例 `top: 14rpx`）
  - `pages/leaderboard/leaderboard.wxss:177-181, 184-187, 189-196` 调整 `.leaderboard-content/.podium-section/.podium-container` 间距与内边距
- 标签不被列表遮挡的层级修复：
  - `pages/leaderboard/leaderboard.wxss:53-61` `.tab-container` 增加 `position: relative; z-index: 3;`

**后端数据维护**
- 审核通过/回退时动态维护 `users.trainingStats`（总时长、按月与按周累计）。
  - 审核通过累计：`cloudfunctions/auditPointRecord/index.js:94-145`
  - 审核回退扣减：`cloudfunctions/auditPointRecord/index.js:186-232`
- 新增一次性回填云函数：`backfillTrainingStats`
  - 入口：`cloudfunctions/backfillTrainingStats/index.js`
  - 汇总历史 `status='approved'` 的训练记录，按统一口径计算小时，写入 `users.trainingStats = { totalHours, byMonth, byWeek }`
  - 支持 `dryRun` 与 `pageSize`

**验证建议**
- 在“训练排行榜”标签下拉刷新，确认本月榜单与数据库一致。
- 抽查用户 `users.trainingStats.byMonth['YYYY-MM']` 与审核通过记录的口径是否相符。
- 审核页面“通过/取消通过”后，返回榜单页面应显示最新排名（积分榜已取消缓存；训练榜下拉刷新）。

**部署与变更记录**
- 更新并部署云函数：`getTrainingLeaderboard`、`backfillTrainingStats`。
- 已通过云开发工具更新并验证返回结构包含 `leaderboard`（含 `rank` 与 `totalTrainingHours`）。
