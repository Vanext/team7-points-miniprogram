#!/bin/bash

# 训练营云函数部署验证脚本
echo "🚀 开始验证训练营云函数部署..."
echo "=================================="

# 测试 getCampData
echo "1. 测试 getCampData 云函数..."
result1=$(npx tcb fn invoke getCampData --params '{"camp_id": "ironman703_2024"}' 2>&1)
if echo "$result1" | grep -q "Invoked successfully"; then
    echo "✅ getCampData 调用成功"
    if echo "$result1" | grep -q '"success":true'; then
        echo "✅ getCampData 返回成功数据"
    else
        echo "⚠️ getCampData 返回错误: $(echo "$result1" | grep -o '"message":"[^"]*"' | head -1)"
    fi
else
    echo "❌ getCampData 调用失败"
fi
echo ""

# 测试 getCampLeaderboard
echo "2. 测试 getCampLeaderboard 云函数..."
result2=$(npx tcb fn invoke getCampLeaderboard --params '{"camp_id": "ironman703_2024"}' 2>&1)
if echo "$result2" | grep -q "Invoked successfully"; then
    echo "✅ getCampLeaderboard 调用成功"
    if echo "$result2" | grep -q '"success":true'; then
        echo "✅ getCampLeaderboard 返回成功数据"
    else
        echo "⚠️ getCampLeaderboard 返回错误: $(echo "$result2" | grep -o '"message":"[^"]*"' | head -1)"
    fi
else
    echo "❌ getCampLeaderboard 调用失败"
fi
echo ""

# 测试 initCampData
echo "3. 测试 initCampData 云函数..."
result3=$(npx tcb fn invoke initCampData --params '{"action": "init_camp_data"}' 2>&1)
if echo "$result3" | grep -q "Invoked successfully"; then
    echo "✅ initCampData 调用成功"
    if echo "$result3" | grep -q '"success":true'; then
        echo "✅ initCampData 数据初始化成功"
    else
        echo "⚠️ initCampData 返回错误: $(echo "$result3" | grep -o '"message":"[^"]*"' | head -1)"
    fi
else
    echo "❌ initCampData 调用失败"
fi
echo ""

# 测试 submitPoints（训练营模式）
echo "4. 测试 submitPoints 云函数（训练营模式）..."
result4=$(npx tcb fn invoke submitPoints --params '{"test": true, "camp_id": "ironman703_2024", "week_num": 1}' 2>&1)
if echo "$result4" | grep -q "Invoked successfully"; then
    echo "✅ submitPoints 调用成功"
    if echo "$result4" | grep -q '"success":true'; then
        echo "✅ submitPoints 返回成功数据"
    else
        echo "⚠️ submitPoints 返回错误: $(echo "$result4" | grep -o '"message":"[^"]*"' | head -1)"
    fi
else
    echo "❌ submitPoints 调用失败"
fi
echo ""

echo "=================================="
echo "🏁 验证完成！"
echo ""
echo "如果所有函数都显示✅，说明训练营云函数部署成功！"
echo "如果有⚠️ 或❌，请查看具体错误信息"
echo ""
echo "接下来可以："
echo "1. 在小程序中测试训练营首页"
echo "2. 验证训练营排行榜功能"
echo "3. 测试训练营上传功能"