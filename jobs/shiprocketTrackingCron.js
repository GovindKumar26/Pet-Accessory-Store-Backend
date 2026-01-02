import cron from 'node-cron';
import Order from '../models/Order.js';
import { syncOrderTracking } from '../services/shiprocketSync.js';

/**
 * Poll Shiprocket tracking for shipped orders
 * Runs every 30 minutes
 */
cron.schedule('*/30 * * * *', async () => {
  console.log('[INFO] Shiprocket tracking cron started');

  try {
    const orders = await Order.find({
      status: 'shipped',
      'logistics.provider': 'shiprocket',
      'logistics.awb': { $exists: true }
    });

    for (const order of orders) {
      try {
        const result = await syncOrderTracking(order);

        if (result.synced) {
          console.log(
            `[INFO] Order ${order.orderNumber} updated ->`,
            result.logisticsStatus
          );
        }
      } catch (err) {
        console.error(
          `[ERROR] Tracking failed for ${order.orderNumber}`,
          err.response?.data || err.message
        );
      }
    }

    console.log('[SUCCESS] Shiprocket tracking cron completed');
  } catch (err) {
    console.error('[FATAL] Shiprocket cron fatal error:', err);
  }
});
