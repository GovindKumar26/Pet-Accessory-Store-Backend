import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Discount from '../models/Discount.js';
import TaxConfig from '../models/TaxConfig.js';
import { authenticate } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

// All order routes require authentication
router.use(authenticate);

router.post('/', async (req, res) => {
  try {
    const { items, shippingAddress, discountCode, shippingCost = 0 } = req.body;

    const shippingCostPaise = Math.round(shippingCost * 100);


    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    // Validate shippingAddress
    if (!shippingAddress) {
      return res.status(400).json({ error: 'Shipping address is required' });
    }
    if (!shippingAddress.name || !shippingAddress.name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!shippingAddress.phone || !shippingAddress.phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!shippingAddress.street || !shippingAddress.street.trim()) {
      return res.status(400).json({ error: 'Street address is required' });
    }
    if (!shippingAddress.city || !shippingAddress.city.trim()) {
      return res.status(400).json({ error: 'City is required' });
    }
    if (!shippingAddress.state || !shippingAddress.state.trim()) {
      return res.status(400).json({ error: 'State is required' });
    }
    if (!shippingAddress.pincode || !shippingAddress.pincode.trim()) {
      return res.status(400).json({ error: 'Pincode is required' });
    }

    // Step 1: Verify products and calculate subtotal from SERVER prices
    const orderItems = [];
    let subtotal = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item.productId || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          error: `Item ${i + 1}: Product ID and quantity (min 1) are required`
        });
      }

      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({
          error: `Item ${i + 1}: Invalid product ID format`
        });
      }

      // Fetch product from database (source of truth for price)
      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          error: `Item ${i + 1}: Product not found`
        });
      }

      // Check stock availability
      if (!product.hasEnoughStock(item.quantity)) {
        return res.status(400).json({
          error: `Item ${i + 1}: Insufficient stock. Only ${product.inventory} available.`
        });
      }

      // Use SERVER price, not client price (security!)
      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;

      // Store snapshot of product data
      orderItems.push({
        productId: product._id,
        title: product.title,
        price: product.price,  // Server's price
        qty: item.quantity     // Model uses 'qty' not 'quantity'
      });
    }

    // Step 2: Apply discount if provided
    let discount = 0;
    //  let discountDetails = null;

    if (discountCode) {
      const discountDoc = await Discount.findOne({ code: discountCode.toUpperCase() });

      if (!discountDoc) {
        return res.status(400).json({ error: 'Invalid discount code' });
      }

      // Check if inactive
      if (!discountDoc.active) {
        return res.status(400).json({ error: 'Discount code is inactive' });
      }

      // Check if not started yet
      const now = new Date();
      if (discountDoc.startsAt && now < discountDoc.startsAt) {
        const startDate = new Date(discountDoc.startsAt).toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata'
        });
        return res.status(400).json({
          error: `Discount code is not yet active. It will start on ${startDate}`
        });
      }

      // Check if expired
      if (discountDoc.endsAt && now > discountDoc.endsAt) {
        return res.status(400).json({ error: 'Discount code has expired' });
      }

      if (!discountDoc.canBeUsed()) {
        return res.status(400).json({ error: 'Discount code usage limit reached' });
      }

      if (discountDoc.minOrderValue && subtotal < discountDoc.minOrderValue) {
        return res.status(400).json({
          error: `Minimum order value of ${(discountDoc.minOrderValue / 100).toFixed(2)} required for this discount`
        });
      }

      discount = discountDoc.calculateDiscount(subtotal);
      //  discountDetails = { code: discountDoc.code, amount: discount };

      // Increment usage count atomically
      await Discount.incrementUsage(discountDoc._id);
    }

    // Step 3: Calculate tax
    const taxConfig = await TaxConfig.findOne({ isActive: true });
    const subtotalAfterDiscount = subtotal - discount;
    const tax = taxConfig ? taxConfig.calculateTax(subtotalAfterDiscount) : 0;

    // Step 4: Calculate final amount
    const amount = subtotalAfterDiscount + tax + shippingCostPaise;

    if (amount <= 0) {
      return res.status(400).json({ error: 'Order total must be greater than 0' });
    }

    // Step 5: Reduce inventory for all products
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { inventory: -item.qty } }  // Use 'qty' not 'quantity'
      );
    }

    // Step 6: Create order with calculated values
    const order = await Order.create({
      userId: req.user._id,
      items: orderItems,
      subtotal,
      discount,
      // discountCode: discountDetails?.code,
      tax,
      shippingCost: shippingCostPaise,
      amount,
      shippingAddress: {
        name: shippingAddress.name,
        phone: shippingAddress.phone,
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
        country: shippingAddress.country || 'India'
      },
      payment: {
        method: 'payu',  // PayU payment only
        status: 'pending'
      },
      status: 'pending'
    });

    res.status(201).json({
      order,
      breakdown: {
        subtotal,
        subtotalRupees: (subtotal / 100).toFixed(2),
        discount,
        tax,
        shippingCostPaise,
        total: amount,
        totalRupees: (amount / 100).toFixed(2)
      }
    });
  } catch (err) {
    console.error('Create order error:', err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    res.status(500).json({ error: 'Failed to create order. Please try again.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;

    const query = { userId: req.user._id };

    if (status) {
      const validStatuses = [
        'pending', 'confirmed', 'processing',
        'shipped', 'delivered', 'cancelled'
      ];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid order status filter' });
      }

      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .select('-__v -payment.rawResponse')
      .lean();

    res.json({ count: orders.length, orders });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/:id/track', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Authorization: User can only track their own orders
    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only track your own orders.' });
    }

    res.json({ status: order.status, order });
  } catch (err) {
    console.error('Track order error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    res.status(500).json({ error: 'Failed to track order. Please try again.' });
  }
});

// Cancel an order
router.post('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id).populate('items.productId');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Authorization: User can only cancel their own orders
    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only cancel your own orders.' });
    }

    // ❌ Prevent cancellation after shipment
    if (order.logistics?.awb) {
      return res.status(400).json({
        error: 'Order has already been shipped and cannot be cancelled'
      });
    }


    // Check if order can be cancelled
    if (!order.canBeCancelled()) {
      return res.status(400).json({
        error: 'Order cannot be cancelled',
        message: `Orders can only be cancelled when status is 'pending' or 'confirmed'. Current status: ${order.status}`
      });
    }

    // Update order status
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason || 'Cancelled by customer';
    order.cancelledBy = 'user';

    // If order was paid, we'll need to initiate refund
    const needsRefund = order.payment.status === 'paid';

    if (needsRefund && order.cancelledBy !== 'system') {
      order.refundRequested = true;
      order.refundRequestedAt = new Date();
      order.refundReason = reason || 'User cancelled paid order';
      order.refundStatus = 'requested';
    }


    if (!order.inventoryRestored) {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { inventory: item.qty } }
        );
      }
      order.inventoryRestored = true;
    }

    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order,
      needsRefund,
      refundMessage: needsRefund ? 'Refund will be processed within 5-7 business days' : null
    });

  } catch (err) {
    console.error('Cancel order error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    res.status(500).json({ error: 'Failed to cancel order. Please try again.' });
  }
});



export default router;
