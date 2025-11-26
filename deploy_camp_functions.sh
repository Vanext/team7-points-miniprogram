#!/bin/bash

# 训练营云函数部署脚本
echo "开始部署训练营云函数..."

# 部署 getCampData
echo "正在部署 getCampData..."
cd "cloudfunctions/getCampData"
npm install
npm run build 2>/dev/null || true
cd ../..

# 部署 getCampLeaderboard  
echo "正在部署 getCampLeaderboard..."
cd "cloudfunctions/getCampLeaderboard"
npm install
npm run build 2>/dev/null || true
cd ../..

# 部署 initCampData
echo "正在部署 initCampData..."
cd "cloudfunctions/initCampData"
npm install
npm run build 2>/dev/null || true
cd ../..

# 更新 submitPoints（训练营相关修改）
echo "正在更新 submitPoints..."
cd "cloudfunctions/submitPoints"
npm install
npm run build 2>/dev/null || true
cd ../..

echo "云函数部署准备完成！"
echo "请在微信开发者工具中："
echo "1. 打开云开发控制台"
echo "2. 选择云函数标签"
echo "3. 右键点击每个训练营函数"
echo "4. 选择'上传并部署：云端安装依赖'"
echo ""
echo "需要手动部署的函数："
echo "- getCampData"
echo "- getCampLeaderboard" 
echo "- initCampData"
echo "- submitPoints"