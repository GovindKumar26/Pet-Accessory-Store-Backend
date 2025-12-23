import Order from '../models/Order.js';
import { restoreInventory } from '../utils/inventory.js';

const EXPIRY_MINUTES = 15;

export const expirePendingOrders = async () => {
  const expiryTime = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

  const pendingOrders = await Order.find({
    status: 'pending',
    'payment.status': 'pending',
    createdAt: { $lt: expiryTime }
  });

  for (const order of pendingOrders) {

     if (order.status === 'cancelled') continue;
    // Mark payment as failed
    order.payment.status = 'failed';
    order.status = 'cancelled';
    order.cancelledBy = 'system';
    order.cancelledAt = new Date();

    
    await restoreInventory(order);
    await order.save();

    console.log(`Order ${order.orderNumber} auto-expired`);
  }
};
