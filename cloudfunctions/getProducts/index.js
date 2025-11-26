// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { limit = 20, offset = 0, category = null } = event
    
    // 构建查询条件
    let whereCondition = {
      stock: db.command.gt(0), // 只获取有库存的商品
      isActive: true // 只获取激活的商品
    }
    
    // 如果指定了分类，添加分类筛选
    if (category) {
      whereCondition.category = category
    }
    
    // 优化查询：只获取必要字段
    const result = await db.collection('products')
      .field({
        _id: true,
        name: true,
        image: true,
        points: true,
        stock: true,
        category: true,
        description: true,
        createTime: true,
        sizesEnabled: true,
        sizes: true,
        sizeStocks: true
      })
      .where(whereCondition)
      .orderBy('createTime', 'desc') // 按创建时间倒序
      .skip(offset)
      .limit(Math.min(limit, 50)) // 限制最大返回数量
      .get()

    // 如果没有商品且是首次查询，插入默认商品
    if (result.data.length === 0 && offset === 0) {
      await insertDefaultProducts()
      
      // 重新查询
      const retryResult = await db.collection('products')
        .field({
          _id: true,
          name: true,
          image: true,
          points: true,
          stock: true,
          category: true,
          description: true,
          createTime: true,
          sizesEnabled: true,
          sizes: true,
          sizeStocks: true
        })
        .where(whereCondition)
        .orderBy('createTime', 'desc')
        .skip(offset)
        .limit(Math.min(limit, 50))
        .get()
      
      return {
        success: true,
        data: retryResult.data,
        total: retryResult.data.length,
        hasMore: retryResult.data.length === limit
      }
    }

    return {
      success: true,
      data: result.data,
      total: result.data.length,
      hasMore: result.data.length === limit
    }
  } catch (error) {
    console.error('获取商品失败:', error)
    return {
      success: false,
      message: '获取商品失败',
      error: error.message
    }
  }
}

// 插入默认商品数据
async function insertDefaultProducts() {
  try {
    const defaultProducts = [
      {
        name: '精美笔记本',
        image: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/products/notebook.jpg',
        points: 100,
        stock: 50,
        category: 'stationery',
        description: '高质量笔记本，适合学习和工作',
        isActive: true,
        createTime: new Date()
      },
      {
        name: '保温水杯',
        image: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/products/cup.jpg',
        points: 200,
        stock: 30,
        category: 'daily',
        description: '不锈钢保温杯，保温效果佳',
        isActive: true,
        createTime: new Date()
      },
      {
        name: '蓝牙耳机',
        image: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/products/earphone.jpg',
        points: 500,
        stock: 20,
        category: 'electronics',
        description: '无线蓝牙耳机，音质清晰',
        isActive: true,
        createTime: new Date()
      },
      {
        name: '运动手环',
        image: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/products/band.jpg',
        points: 800,
        stock: 15,
        category: 'electronics',
        description: '智能运动手环，健康监测',
        isActive: true,
        createTime: new Date()
      }
    ]

    await db.collection('products').add({
      data: defaultProducts
    })
    
    console.log('默认商品插入成功')
  } catch (error) {
    console.error('插入默认商品失败:', error)
  }
}
