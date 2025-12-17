import express from 'express';
import Product from '../models/Product.js';
import Discount from '../models/Discount.js';
import TaxConfig from '../models/TaxConfig.js';
import User from '../models/User.js';
import slugify from 'slugify';
const router = express.Router();

// admin middleware assumes req.userId is set (use same token auth as orders but also checks role)
import jwt from 'jsonwebtoken';
const adminAuth = async (req,res,next)=>{
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'access_secret');
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: 'No user' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    req.userId = user._id;
    next();
  } catch(e){ return res.status(401).json({ error: 'Invalid token' }); }
};

/**
 * Products CRUD for admin
 */
router.post('/products', adminAuth, async (req,res)=>{
  const { title, description, price=0, compareAt, images=[], category, tags=[], featured=false, inventory=0, slug } = req.body;
  const finalSlug = slug || slugify(title || Math.random().toString(36).slice(2), { lower: true, strict: true });
  const existing = await Product.findOne({ slug: finalSlug });
  if (existing) return res.status(400).json({ error: 'Slug exists' });
  const p = await Product.create({ title, description, price, compareAt, images, category, tags, featured, inventory, slug: finalSlug });
  res.json({ product: p });
});

router.put('/products/:id', adminAuth, async (req,res)=>{
  const { id } = req.params;
  const updates = req.body || {};
  if (updates.title && !updates.slug) {
    updates.slug = slugify(updates.title, { lower: true, strict: true });
  }
  const p = await Product.findByIdAndUpdate(id, updates, { new: true });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ product: p });
});

router.delete('/products/:id', adminAuth, async (req,res)=>{
  const { id } = req.params;
  const p = await Product.findByIdAndDelete(id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Inventory update (bulk)
router.post('/inventory', adminAuth, async (req,res)=>{
  const { updates } = req.body; // [{id, inventory}]
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Invalid updates' });
  const results = [];
  for (const u of updates) {
    const item = await Product.findByIdAndUpdate(u.id, { inventory: u.inventory }, { new: true });
    if (item) results.push({ id: item._id, inventory: item.inventory });
  }
  res.json({ results });
});

/**
 * Discounts CRUD
 */
router.post('/discounts', adminAuth, async (req,res)=>{
  const doc = await Discount.create(req.body);
  res.json({ discount: doc });
});
router.get('/discounts', adminAuth, async (req,res)=>{
  const all = await Discount.find().sort({ createdAt: -1 });
  res.json({ discounts: all });
});
router.get('/discounts/:id', adminAuth, async (req,res)=>{
  const d = await Discount.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' }); res.json({ discount: d });
});
router.put('/discounts/:id', adminAuth, async (req,res)=>{
  const d = await Discount.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!d) return res.status(404).json({ error: 'Not found' }); res.json({ discount: d });
});
router.delete('/discounts/:id', adminAuth, async (req,res)=>{
  await Discount.findByIdAndDelete(req.params.id); res.json({ ok:true });
});

/**
 * Tax config (single resource)
 */
router.get('/tax', adminAuth, async (req,res)=>{
  let t = await TaxConfig.findOne();
  if (!t) t = await TaxConfig.create({ name: 'GST', rate: 0, inclusive: false });
  res.json({ tax: t });
});
router.put('/tax', adminAuth, async (req,res)=>{
  let t = await TaxConfig.findOne();
  if (!t) t = await TaxConfig.create(req.body);
  else t = await TaxConfig.findByIdAndUpdate(t._id, req.body, { new: true });
  res.json({ tax: t });
});

export default router;
