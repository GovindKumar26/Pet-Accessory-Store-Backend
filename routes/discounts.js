import express from 'express';
import Discount from '../models/Discount.js';

const router = express.Router();

/**
 * GET /api/discounts - Get all active discounts (PUBLIC)
 * This endpoint is public so users can see available discounts on the landing page
 */
router.get('/', async (req, res) => {
    try {
        // Only return active discounts that haven't expired
        const now = new Date();
        const activeDiscounts = await Discount.find({
            active: true,
            endsAt: { $gt: now }  // Fixed: use endsAt not expiresAt
        }).sort({ createdAt: -1 });

        res.json({ discounts: activeDiscounts });
    } catch (err) {
        console.error('Get public discounts error:', err);
        res.status(500).json({ error: 'Failed to fetch discounts' });
    }
});

/**
 * GET /api/discounts/:code - Validate a discount code (PUBLIC)
 * Allows users to check if a discount code is valid before applying
 */
router.get('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const now = new Date();

        const discount = await Discount.findOne({
            code: code.toUpperCase(),
            active: true,
            endsAt: { $gt: now }  // Fixed: use endsAt not expiresAt
        });

        if (!discount) {
            return res.status(404).json({ error: 'Discount code not found or expired' });
        }

        res.json({ discount });
    } catch (err) {
        console.error('Validate discount error:', err);
        res.status(500).json({ error: 'Failed to validate discount code' });
    }
});

export default router;
