import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// GET /api/products?featured=true&limit=8&category=...&q=...
router.get('/', async (req, res) => {
  const { featured, limit=20, category, q } = req.query;
  const filter = {};
  if (featured==='true') filter.featured = true;
  if (category) filter.category = category;
  if (q) filter.$or = [{ title: new RegExp(q,'i') }, { description: new RegExp(q,'i') }];
  const items = await Product.find(filter).limit(parseInt(limit));
  res.json({ items });
});

router.get('/categories', async (req, res) => {
  const cats = await Product.distinct('category');
  res.json({ categories: cats });
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const p = await Product.findOne({ $or: [{ _id: id }, { slug: id }] });
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json({ product: p });
});

export default router;
