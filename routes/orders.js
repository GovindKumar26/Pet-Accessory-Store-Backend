import express from 'express';
import Order from '../models/Order.js';
import jwt from 'jsonwebtoken';
const router = express.Router();

const authMiddleware = (req,res,next)=>{
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'access_secret');
    req.userId = payload.id;
    next();
  } catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
};

router.post('/', authMiddleware, async (req, res) => {
  const { items, amount, shippingAddress } = req.body;
  const order = await Order.create({ userId: req.userId, items, amount, shippingAddress });
  res.json({ order });
});

router.get('/', authMiddleware, async (req, res) => {
  const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json({ orders });
});

router.get('/:id/track', authMiddleware, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json({ status: order.status, order });
});

export default router;
