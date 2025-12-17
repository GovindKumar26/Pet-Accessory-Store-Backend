import express from 'express';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

const router = express.Router();

// Create payment order (mocked). Frontend expects /api/payments/create
router.post('/create', async (req, res) => {
  const { amount, currency='INR' } = req.body || {};
  const mockOrder = { id: 'order_' + nanoid(10), amount, currency };
  res.json({ order: mockOrder, key: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock' });
});

// Verify payment signature (mock validation)
router.post('/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body || {};
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (secret) {
    const hmac = crypto.createHmac('sha256', secret).update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
    if (hmac !== razorpay_signature) return res.status(400).json({ ok:false, error:'Invalid signature' });
  }
  res.json({ ok: true, paymentId: razorpay_payment_id, orderId });
});

export default router;
