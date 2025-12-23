import cron from 'node-cron';
import { expirePendingOrders } from './jobs/expirePendingOrders.js';

cron.schedule('*/5 * * * *', async () => {
  console.log('Running pending order expiry job...');
  await expirePendingOrders();
});
