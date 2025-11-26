// Database migration to add exchange lock functionality
// This migration adds fields to users collection and creates exchange_lock_logs collection

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    console.log('Starting exchange lock migration...')
    
    // 1. Add exchange lock fields to users collection
    console.log('Adding exchange lock fields to users collection...')
    
    // Get all users to update them
    const users = await db.collection('users').limit(1000).get()
    
    for (const user of users.data) {
      // Check if fields already exist
      const updateData = {}
      
      if (typeof user.exchange_locked === 'undefined') {
        updateData.exchange_locked = false
      }
      
      if (typeof user.lock_reason === 'undefined') {
        updateData.lock_reason = ''
      }
      
      if (typeof user.locked_at === 'undefined') {
        updateData.locked_at = null
      }
      
      if (typeof user.locked_by_admin_id === 'undefined') {
        updateData.locked_by_admin_id = ''
      }
      
      if (typeof user.auto_unlock_date === 'undefined') {
        updateData.auto_unlock_date = null
      }
      
      if (typeof user.competition_participation_count === 'undefined') {
        updateData.competition_participation_count = 0
      }
      
      if (typeof user.last_competition_date === 'undefined') {
        updateData.last_competition_date = null
      }
      
      // Only update if there are fields to add
      if (Object.keys(updateData).length > 0) {
        await db.collection('users').doc(user._id).update({
          data: updateData
        })
        console.log(`Updated user ${user._id} with exchange lock fields`)
      }
    }
    
    // 2. Create exchange_lock_logs collection if it doesn't exist
    console.log('Creating exchange_lock_logs collection...')
    try {
      await db.createCollection('exchange_lock_logs')
      console.log('exchange_lock_logs collection created')
    } catch (error) {
      if (error.code === -502005) {
        console.log('exchange_lock_logs collection already exists')
      } else {
        throw error
      }
    }
    
    // 3. Create competition_records collection if it doesn't exist
    console.log('Creating competition_records collection...')
    try {
      await db.createCollection('competition_records')
      console.log('competition_records collection created')
    } catch (error) {
      if (error.code === -502005) {
        console.log('competition_records collection already exists')
      } else {
        throw error
      }
    }
    
    console.log('Migration completed successfully!')
    return {
      success: true,
      message: 'Exchange lock migration completed successfully'
    }
    
  } catch (error) {
    console.error('Migration failed:', error)
    return {
      success: false,
      message: `Migration failed: ${error.message}`
    }
  }
}