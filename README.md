# Team 7 俱乐部积分小程序

## 项目信息
- AppID: wx53dce74e3bb3e8c8
- 云环境ID: cloudbase-0gvjuae479205e8

## 开发说明
1. 使用微信开发者工具打开项目
2. 确认AppID配置正确
3. 启用云开发功能
4. 开始开发测试

## 功能模块
- 首页：品牌展示和快捷入口
- 积分上传：训练和比赛积分提交
- 排行榜：积分排名展示
- 积分商城：积分兑换商品
- 个人中心：用户信息管理

## 注意事项
- 本项目使用了微信云开发
- 请确保网络连接正常
- 首次使用需要进行登录授权

## 最近归档更新摘要（2025-11-29）
- 创建私有归档仓库：`team7-points-miniprogram-frontend-archive-20251128`（分支 `main`）
- 最新提交：`e9528a4afc75e22aeffd5dcae021825909752307`
- 归档范围：前端 `pages/*`、`app.js/app.wxss`，后端 `cloudfunctions/*`，数据库结构 `db-schema/*`
- 环境一致性：云函数统一使用 `cloud.DYNAMIC_CURRENT_ENV`
- 索引快照：包含 `point_records` 的 `status + _openid`、`_openid + submitTime` 等复合索引
- 验证与回滚：拉取仓库后抽样对比函数与页面；前端/云函数/索引分别按归档目录覆盖与恢复
