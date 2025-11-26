# 数据库权限和索引配置指南

## 集合权限配置

### 1. users 集合
```json
{
  "read": true,
  "write": false,
  "admin": false
}
```

**权限说明：**
- 所有用户可读取用户信息
- 用户只能修改自己的数据
- 管理员有全部权限

### 2. points 集合
```json
{
  "read": true,
  "write": false,
  "admin": false
}
```

**权限说明：**
- 所有用户可读取积分记录
- 用户只能创建自己的积分记录
- 管理员可审核和修改

### 3. products 集合
```json
{
  "read": true,
  "write": false,
  "admin": false
}
```

**权限说明：**
- 所有用户可读取商品信息
- 只有管理员可修改商品

### 4. exchange_records 集合
```json
{
  "read": true,
  "write": false,
  "admin": false
}
```

**权限说明：**
- 用户可读取自己的兑换记录
- 兑换操作通过云函数进行

### 5. exchange_lock_logs 集合
```json
{
  "read": false,
  "write": false,
  "admin": true
}
```

**权限说明：**
- 只有管理员可查看锁定日志
- 通过云函数记录锁定操作

### 6. competition_records 集合
```json
{
  "read": true,
  "write": false,
  "admin": false
}
```

**权限说明：**
- 用户可查看自己的比赛记录
- 比赛记录通过云函数创建

## 数据库索引配置

### 1. users 集合索引
```javascript
// 用户OpenID索引
db.collection('users').createIndex({ _openid: 1 })

// 积分排序索引
db.collection('users').createIndex({ totalPoints: -1 })

// 激活状态索引
db.collection('users').createIndex({ isActivated: 1 })

// 管理员状态索引
db.collection('users').createIndex({ isAdmin: 1 })

// 创建时间索引
db.collection('users').createIndex({ createTime: -1 })

// 兑换锁定状态索引（新增）
db.collection('users').createIndex({ exchange_locked: 1 })

// 最后比赛时间索引（新增）
db.collection('users').createIndex({ last_competition_date: -1 })
```

### 2. points 集合索引
```javascript
// 用户积分记录索引
db.collection('points').createIndex({ _openid: 1, createTime: -1 })

// 审核状态索引
db.collection('points').createIndex({ auditStatus: 1 })

// 分类索引
db.collection('points').createIndex({ category: 1 })

// 比赛类型索引
db.collection('points').createIndex({ isCompetition: 1 })

// 年度统计索引
db.collection('points').createIndex({ 
  _openid: 1, 
  createTime: -1,
  auditStatus: 1 
})
```

### 3. products 集合索引
```javascript
// 商品状态索引
db.collection('products').createIndex({ status: 1 })

// 库存状态索引
db.collection('products').createIndex({ stock: 1 })

// 所需积分索引
db.collection('products').createIndex({ requiredPoints: 1 })
```

### 4. exchange_records 集合索引
```javascript
// 用户兑换记录索引
db.collection('exchange_records').createIndex({ _openid: 1, createTime: -1 })

// 商品兑换统计
db.collection('exchange_records').createIndex({ productId: 1 })

// 兑换状态索引
db.collection('exchange_records').createIndex({ status: 1 })
```

### 5. exchange_lock_logs 集合索引
```javascript
// 用户锁定日志索引
db.collection('exchange_lock_logs').createIndex({ userId: 1, createTime: -1 })

// 操作者索引
db.collection('exchange_lock_logs').createIndex({ operatorId: 1 })

// 锁定类型索引
db.collection('exchange_lock_logs').createIndex({ lockType: 1 })
```

### 6. competition_records 集合索引
```javascript
// 用户比赛记录索引
db.collection('competition_records').createIndex({ userId: 1, competitionDate: -1 })

// 比赛类型索引
db.collection('competition_records').createIndex({ competitionType: 1 })

// 年度统计索引
db.collection('competition_records').createIndex({ 
  userId: 1, 
  year: -1,
  competitionDate: -1 
})
```

## 安全规则配置

### 1. 用户数据安全规则
```javascript
// 用户只能修改自己的数据
const isOwner = auth.openid == doc._openid
return isOwner || (auth != null && auth.isAdmin == true)
```

### 2. 积分记录安全规则
```javascript
// 用户只能创建自己的积分记录，管理员可以审核
const isOwner = auth.openid == doc._openid
if (method == 'add') {
  return isOwner && doc.auditStatus == 'pending'
}
return (auth != null && auth.isAdmin == true)
```

### 3. 兑换记录安全规则
```javascript
// 用户只能查看自己的兑换记录
const isOwner = auth.openid == doc._openid
return isOwner || (auth != null && auth.isAdmin == true)
```

## 部署检查清单

### 云函数部署前检查
- [ ] 所有云函数代码已更新
- [ ] 依赖包已安装
- [ ] 环境变量已配置
- [ ] 数据库连接已测试

### 数据库配置检查
- [ ] 集合权限已设置
- [ ] 索引已创建
- [ ] 安全规则已配置
- [ ] 数据备份已完成

### 功能测试检查
- [ ] 用户锁定/解锁功能正常
- [ ] 自动解锁逻辑正常
- [ ] 积分范围验证正常
- [ ] 兑换权限检查正常
- [ ] 管理员功能正常

## 监控和告警

### 关键指标监控
1. 云函数调用成功率
2. 数据库操作响应时间
3. 用户锁定/解锁频率
4. 异常错误率

### 告警配置
- 云函数错误率超过5%
- 数据库操作响应时间超过1秒
- 用户锁定操作异常增长
- 系统资源使用率超过80%