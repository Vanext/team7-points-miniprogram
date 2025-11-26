/**
 * 重置商品数据 - 清理并重新插入完整的商品列表
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 先获取所有现有商品并删除
    const existingProducts = await db.collection('products').get()
    if (existingProducts.data.length > 0) {
      // 逐个删除现有商品
      for (const product of existingProducts.data) {
        await db.collection('products').doc(product._id).remove()
      }
    }
    
    // 定义完整的商品列表
    const products = [
      {
        _id: 'product_tshirt_001',
        name: 'Team7限量版T恤',
        description: '高品质纯棉材质，Team7专属设计，限量发售',
        points: 800,
        stock: 50,
        image: '/images/product-tshirt.svg',
        category: 'apparel',
        isActive: true,
        createTime: db.serverDate()
      },
      {
        _id: 'product_cup_001',
        name: 'Team7定制水杯',
        description: '高品质不锈钢保温杯，Team7专属logo，容量500ml',
        points: 300,
        stock: 100,
        image: '/images/product-cup.svg',
        category: 'equipment',
        isActive: true,
        createTime: db.serverDate()
      },
      {
        _id: 'product_cup_002',
        name: 'Team7运动水杯',
        description: '轻便运动水杯，防漏设计，Team7定制标识',
        points: 450,
        stock: 80,
        image: '/images/product-cup.svg',
        category: 'equipment',
        isActive: true,
        createTime: db.serverDate()
      },
      {
        _id: 'product_medal_001',
        name: '年度优秀会员奖牌',
        description: '精美金属奖牌，表彰年度优秀表现，纪念意义重大',
        points: 1200,
        stock: 20,
        image: '/images/product-medal-new.svg',
        category: 'award',
        isActive: true,
        createTime: db.serverDate()
      }
    ]

    // 批量插入新商品
    const insertResult = await db.collection('products').add({
      data: products
    })

    return {
      success: true,
      message: '商品数据重置成功',
      data: {
        deletedCount: '所有旧商品已删除',
        insertedCount: products.length,
        products: products
      }
    }

  } catch (error) {
    console.error('重置商品数据失败:', error)
    return {
      success: false,
      message: '重置商品数据失败',
      error: error.message
    }
  }
}