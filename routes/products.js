import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// GET /api/products?limit=20&category=...&q=...
router.get('/', async (req, res) => {
  try {
    const { limit=20, category, q } = req.query;
    const filter = {};
    
    if (category) filter.category = category;
    if (q) filter.$or = [{ title: new RegExp(q,'i') }, { description: new RegExp(q,'i') }];
    
    const items = await Product.find(filter).limit(parseInt(limit));
    res.json({ items });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Failed to fetch products. Please try again.' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const cats = await Product.distinct('category');
    res.json({ categories: cats });
  } catch (err) {
    console.error('Get categories error:', err);
    res.status(500).json({ error: 'Failed to fetch categories. Please try again.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if it's a valid MongoDB ObjectId format (24 hex characters)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    
    let query;
    if (isValidObjectId) {
      query = { _id: id };      // Only check _id
    } else {
      query = { slug: id };     // Only check slug
    }
    
    const p = await Product.findOne(query);
    
    if (!p) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    res.json({ product: p });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to fetch product. Please try again.' });
  }
});

export default router;
