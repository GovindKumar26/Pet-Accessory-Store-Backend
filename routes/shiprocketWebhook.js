import express from 'express';
import Order from '../models/Order.js';

const router = express.Router();

// Shiprocket webhook endpoint
// POST /api/shiprocket/webhook
router.post('/webhook', async (req, res) => {
    try {
        const webhookData = req.body;

        console.log('Shiprocket webhook received:', JSON.stringify(webhookData, null, 2));

        // Shiprocket sends different event types
        // Common fields: awb, order_id, current_status, etc.
        const { awb, order_id, current_status, delivered_date } = webhookData;

        if (!awb && !order_id) {
            return res.status(400).json({ error: 'Missing AWB or order_id' });
        }

        // Find order by AWB or Shiprocket order ID
        const order = await Order.findOne({
            $or: [
                { 'logistics.awb': awb },
                { 'logistics.shiprocketOrderId': order_id }
            ]
        });

        if (!order) {
            console.log(`Order not found for AWB: ${awb}, order_id: ${order_id}`);
            return res.status(404).json({ error: 'Order not found' });
        }

        // Update order based on status
        const statusMap = {
            'PICKUP SCHEDULED': 'shipped',
            'PICKED UP': 'shipped',
            'IN TRANSIT': 'shipped',
            'OUT FOR DELIVERY': 'shipped',
            'DELIVERED': 'delivered',
            'CANCELLED': 'cancelled',
            'RTO INITIATED': 'shipped', // Return to origin
            'RTO DELIVERED': 'cancelled'
        };

        const newStatus = statusMap[current_status?.toUpperCase()];

        if (newStatus) {
            order.status = newStatus;

            // If delivered, set timestamp
            if (newStatus === 'delivered' && delivered_date) {
                order.logistics.deliveredAt = new Date(delivered_date);
            } else if (newStatus === 'delivered' && !order.logistics.deliveredAt) {
                order.logistics.deliveredAt = new Date();
            }

            await order.save();
            console.log(`Order ${order.orderNumber} updated to status: ${newStatus}`);
        }

        res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
        console.error('Shiprocket webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
