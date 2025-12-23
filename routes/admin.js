import express from 'express';
import Product from '../models/Product.js';
import Discount from '../models/Discount.js';
import TaxConfig from '../models/TaxConfig.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import cloudinary from '../config/cloudinary.js';
import Order from '../models/Order.js';
import { createShipmentFromOrder } from '../services/shiprocket.js';



// Admin API expects price in RUPEES (decimal)

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireAdmin);

/**
 * Products CRUD for admin
 */
router.post('/products', upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, price, category, tags = [], inventory = 0 } = req.body;

    // Validate required fields
    if (!title || title.trim().length < 3) {
      return res.status(400).json({ error: 'Title must be at least 3 characters' });
    }
    if (!description || description.trim().length < 10) {
      return res.status(400).json({ error: 'Description must be at least 10 characters' });
    }
    if (price == null || price < 0) {
      return res.status(400).json({ error: 'Price is required and must be non-negative' });
    }
    if (!category || !category.trim()) {
      return res.status(400).json({ error: 'Category is required' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    const pricePaise = Math.round(price * 100);

    // Extract Cloudinary data
    const images = req.files.map(file => ({
      url: file.path,
      publicId: file.filename
    }));

    // Let the Product model generate slug automatically (includes ID)
    const p = await Product.create({ title, description, price: pricePaise, images, category, tags, inventory });
    res.status(201).json({ product: p });
  } catch (err) {
    console.error('Create product error:', err);

    // Handle mongoose validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    // Handle duplicate slug (shouldn't happen with ID-based slugs, but just in case)
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Product with similar name already exists' });
    }

    res.status(500).json({ error: 'Failed to create product. Please try again.' });
  }
});



router.put(
  '/products/:id',
  upload.array('images', 5),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body || {};

      // Fetch product
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }


      if (updates.price != null) {
        updates.price = Math.round(Number(updates.price) * 100);
      }


      if (updates.tags) {
        updates.tags = Array.isArray(updates.tags)
          ? updates.tags
          : updates.tags.split(',').map(t => t.trim());
      }


      let removeImages = updates.removeImages;

      if (removeImages) {
        if (!Array.isArray(removeImages)) {
          removeImages = [removeImages];
        }

        for (const publicId of removeImages) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error(`Cloudinary cleanup failed for ${publicId}, skipping...`);
          }
        }

        // Remove from product.images
        product.images = product.images.filter(
          img => !removeImages.includes(img.publicId)
        );
      }


      if (req.files && req.files.length > 0) {
        const newImages = req.files.map(file => ({
          url: file.path,
          publicId: file.filename
        }));

        product.images.push(...newImages);
      }


      if (product.images.length === 0) {
        return res.status(400).json({
          error: 'Product must have at least one image'
        });
      }


      const allowed = ['title', 'description', 'price', 'category', 'tags', 'inventory'];
      allowed.forEach(field => {
        if (updates[field] !== undefined) {
          product[field] = updates[field];
        }
      });

      await product.save();

      res.json({ product });

    } catch (err) {
      console.error('Update product error:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({ error: 'Invalid product ID format' });
      }

      res.status(500).json({ error: 'Failed to update product' });
    }
  }
);

/**
 * GET /api/admin/refunds
 * List all refund requests
 */

router.get('/refunds', async (req, res) => {
  try {
    const { status = 'requested' } = req.query;

    const refunds = await Order.find({
      refundStatus: status
    })
      .populate('userId', 'name email')
      .sort({ refundRequestedAt: -1 })
      .select({
        orderNumber: 1,
        userId: 1,
        amount: 1,
        discount: 1,
        refundStatus: 1,
        refundRequestedAt: 1,
        refundReason: 1,
        payment: 1,
        createdAt: 1
      });

    res.json({
      count: refunds.length,
      refunds
    });
  } catch (err) {
    console.error('Admin refund list error:', err);
    res.status(500).json({ error: 'Failed to fetch refund requests' });
  }
});


// Inventory update (bulk)
router.post('/inventory', async (req, res) => {
  try {
    const { updates } = req.body; // [{id, inventory}]

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates must be an array of {id, inventory} objects' });
    }

    const results = [];
    const errors = [];

    for (const u of updates) {
      try {
        if (!u.id || u.inventory == null) {
          errors.push({ id: u.id, error: 'Missing id or inventory' });
          continue;
        }

        const item = await Product.findByIdAndUpdate(
          u.id,
          { inventory: u.inventory },
          { new: true, runValidators: true }
        );

        if (item) {
          results.push({ id: item._id, inventory: item.inventory });
        } else {
          errors.push({ id: u.id, error: 'Product not found' });
        }
      } catch (err) {
        errors.push({ id: u.id, error: err.message });
      }
    }

    res.json({
      results,
      errors: errors.length > 0 ? errors : undefined,
      summary: `${results.length} updated, ${errors.length} failed`
    });
  } catch (err) {
    console.error('Bulk inventory update error:', err);
    res.status(500).json({ error: 'Failed to update inventory. Please try again.' });
  }
});

/**
 * Discounts CRUD
 */
router.post('/discounts', async (req, res) => {
  try {
    if (req.body.type === 'fixed') {
      req.body.value = Math.round(req.body.value * 100);
    }

    if (req.body.type === 'percentage') {
      if (req.body.value < 0 || req.body.value >= 100) {
        res.status(400).json({ error: "Percentage discount cannot be negative or greater than 100" })
      }
    }

    if (req.body.minOrderValue != null) {
      req.body.minOrderValue = Math.round(req.body.minOrderValue * 100);
    }

    if (req.body.maxDiscountAmount != null) {
      req.body.maxDiscountAmount = Math.round(req.body.maxDiscountAmount * 100);
    }

    const doc = await Discount.create(req.body);
    res.status(201).json({ discount: doc });
  } catch (err) {
    console.error('Create discount error:', err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    if (err.code === 11000) {
      return res.status(400).json({ error: 'Discount code already exists' });
    }

    res.status(500).json({ error: 'Failed to create discount. Please try again.' });
  }
});

router.get('/discounts', async (req, res) => {
  try {
    const all = await Discount.find().sort({ createdAt: -1 });
    res.json({ discounts: all });
  } catch (err) {
    console.error('Get discounts error:', err);
    res.status(500).json({ error: 'Failed to fetch discounts. Please try again.' });
  }
});

router.get('/discounts/:id', async (req, res) => {
  try {
    const d = await Discount.findById(req.params.id);
    if (!d) return res.status(404).json({ error: 'Discount not found' });
    res.json({ discount: d });
  } catch (err) {
    console.error('Get discount error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid discount ID format' });
    }

    res.status(500).json({ error: 'Failed to fetch discount. Please try again.' });
  }
});

router.put('/discounts/:id', async (req, res) => {
  try {

    const existing = await Discount.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    const discountType = req.body.type || existing.type;

    if (discountType === 'fixed' && req.body.value != null) {
      req.body.value = Math.round(req.body.value * 100);
    }

    if (req.body.minOrderValue != null) {
      req.body.minOrderValue = Math.round(req.body.minOrderValue * 100);
    }

    if (req.body.maxDiscountAmount != null) {
      req.body.maxDiscountAmount = Math.round(req.body.maxDiscountAmount * 100);
    }

    const d = await Discount.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!d) return res.status(404).json({ error: 'Discount not found' });
    res.json({ discount: d });
  } catch (err) {
    console.error('Update discount error:', err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid discount ID format' });
    }

    res.status(500).json({ error: 'Failed to update discount. Please try again.' });
  }
});

router.delete('/discounts/:id', async (req, res) => {
  try {
    const d = await Discount.findByIdAndDelete(req.params.id);

    if (!d) {
      return res.status(404).json({ error: 'Discount not found' });
    }

    res.json({ ok: true, message: 'Discount deleted successfully' });
  } catch (err) {
    console.error('Delete discount error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid discount ID format' });
    }

    res.status(500).json({ error: 'Failed to delete discount. Please try again.' });
  }
});

/**
 * Tax config (single resource)
 */
router.get('/tax', async (req, res) => {
  try {
    let t = await TaxConfig.findOne();
    if (!t) {
      t = await TaxConfig.create({ name: 'GST', rate: 0, inclusive: false, isActive: true });
    }
    res.json({ tax: t });
  } catch (err) {
    console.error('Get tax config error:', err);
    res.status(500).json({ error: 'Failed to fetch tax configuration. Please try again.' });
  }
});
router.put('/tax', async (req, res) => {
  try {
    let t = await TaxConfig.findOne();

    if (!t) {
      t = await TaxConfig.create(req.body);
    } else {
      t = await TaxConfig.findByIdAndUpdate(
        t._id,
        req.body,
        { new: true, runValidators: true }
      );
    }

    res.json({ tax: t });
  } catch (err) {
    console.error('Update tax config error:', err);

    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: `Validation failed: ${messages.join(', ')}` });
    }

    res.status(500).json({ error: 'Failed to update tax configuration. Please try again.' });
  }
});


/**
 * PATCH /api/admin/orders/:id/status
 * Update order status (admin only)
 */



router.get('/orders', async (req, res) => {
  try {
    const {
      status,
      paymentStatus,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (paymentStatus) query['payment.status'] = paymentStatus;

    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-payment.rawResponse')
        .populate('userId', 'email')
        .lean(),
      Order.countDocuments(query)
    ]);

    res.json({
      page: Number(page),
      limit: Number(limit),
      total,
      orders
    });
  } catch (err) {
    console.error('Admin list orders error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/* =====================================================
   GET /api/admin/orders/:id
   Get full order (admin view)
===================================================== */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    const order = await Order.findById(id)
      .populate('userId', 'email')
      .lean();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  } catch (err) {
    console.error('Admin get order error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * POST /api/admin/orders/:id/ship
 * Create Shiprocket shipment and mark order as shipped
 */
router.post('/orders/:id/ship', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Validate order ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    // 2. Fetch order
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // 3. Business validations
    if (order.status !== 'confirmed') {
      return res.status(400).json({
        error: 'Only confirmed orders can be shipped',
        currentStatus: order.status
      });
    }

    if (order.logistics?.awb) {
      return res.status(409).json({
        error: 'Order already shipped',
        awb: order.logistics.awb
      });
    }

    if (order.payment.status !== 'paid') {
      return res.status(400).json({
        error: 'Cannot ship unpaid order'
      });
    }

    // 4. Create shipment via Shiprocket
    const shiprocketResponse = await createShipmentFromOrder(order);

    // Defensive checks (Shiprocket can be weird)
    if (!shiprocketResponse?.shipment_id || !shiprocketResponse?.awb_code) {
      return res.status(502).json({
        error: 'Invalid response from Shiprocket',
        shiprocketResponse
      });
    }

    // 5. Save logistics info
    order.logistics = {
      provider: 'shiprocket',
      shipmentId: shiprocketResponse.shipment_id,
      orderId: shiprocketResponse.order_id,
      awb: shiprocketResponse.awb_code,
      courierName: shiprocketResponse.courier_name,
      status: 'in_transit',
      shippedAt: new Date()
    };

    // 6. Update order status
    order.status = 'shipped';

    await order.save();

    res.json({
      success: true,
      message: 'Order shipped successfully',
      order,
      logistics: order.logistics
    });
  } catch (err) {
    console.error('Admin ship order error:', err);

    res.status(500).json({
      error: 'Failed to ship order',
      details: err.response?.data || err.message
    });
  }
});



router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status: newStatus } = req.body;

    const allowedTransitions = {
      pending: [], // handled by PayU only
      confirmed: ['processing', 'cancelled'],
      processing: ['shipped'],
      shipped: ['delivered'],
      delivered: [],
      cancelled: []
    };

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const allowed = allowedTransitions[order.status] || [];

    if (!allowed.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from ${order.status} to ${newStatus}`
      });
    }

    if (newStatus === 'cancelled' && order.logistics?.awb) {
      return res.status(400).json({
        error: 'Cannot cancel an order after shipment has been created'
      });
    }


    order.status = newStatus;
    if (order.status === 'cancelled') {

      // restore inventory if not already restored
      if (!order.inventoryRestored) {
        for (const item of order.items) {
          await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { inventory: item.qty } }
          );
        }
        order.inventoryRestored = true;
      }
      if (order.payment.status === 'paid') {
        order.refundRequested = true;
        order.refundRequestedAt = new Date();
        order.refundStatus = 'requested';
      }
      order.cancelledBy = 'admin';
      order.cancelledAt = new Date();

    }
    await order.save();

    res.json({
      success: true,
      order
    });
  } catch (err) {
    console.error('Admin update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});


router.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = await Product.findById(id);

    if (!p) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const deletionPromises = p.images.map(img =>
      cloudinary.uploader.destroy(img.publicId)
        .catch(err => console.error(`Failed to delete image ${img.publicId}:`, err))
    );

    await Promise.all(deletionPromises);

    await p.deleteOne();

    res.json({ ok: true, message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Delete product error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid product ID format' });
    }

    res.status(500).json({ error: 'Failed to delete product. Please try again.' });
  }
});






/**
 * POST /api/admin/refunds/:orderId/approve
 */

import axios from 'axios';
import crypto from 'crypto';

const initiatePayURefund = async ({ mihpayid, amountRupees }) => {
  const command = 'cancel_refund_transaction';

  // Refund Hash Sequence: key|command|var1|salt
  const hashString = `${process.env.PAYU_MERCHANT_KEY}|${command}|${mihpayid}|${process.env.PAYU_MERCHANT_SALT}`;
  const hash = crypto.createHash('sha512').update(hashString).digest('hex');

  // PayU Web Services REQUIRES form-urlencoded, not JSON
  const params = new URLSearchParams();
  params.append('key', process.env.PAYU_MERCHANT_KEY);
  params.append('command', command);
  params.append('var1', mihpayid);    // The PayU Payment ID
  params.append('var2', amountRupees); // The amount to refund
  params.append('hash', hash);

  const url = process.env.NODE_ENV === 'production'
    ? 'https://info.payu.in/merchant/postservice.php?form=2'
    : 'https://test.payu.in/merchant/postservice.php?form=2';

  const response = await axios.post(url, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data;
};

// router.post('/refunds/:orderId/approve', async (req, res) => {
//   const order = await Order.findById(req.params.orderId);

//   if (!order) {
//     return res.status(404).json({ error: 'Order not found' });
//   }

//   if (order.refundStatus !== 'requested') {
//     return res.status(400).json({ error: 'Refund not in requested state' });
//   }

//   if (order.payment.status !== 'paid') {
//   return res.status(400).json({
//     error: 'Refund not allowed for unpaid orders'
//   });
// }

// if (order.refundStatus === 'processing') {
//   return res.status(400).json({ error: 'Refund already in processing state' });
// }


//   order.refundStatus = 'processing';
//   await order.save();

//   res.json({
//     success: true,
//     message: 'Refund approved and marked as processing',
//     orderId: order._id
//   });
// });


router.post('/refunds/:orderId/approve', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId);

    // 1. Validations (Keep your existing checks)
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.refundStatus !== 'requested') return res.status(400).json({ error: 'Refund not in requested state' });
    if (order.refundStatus === 'processing') {
      return res.status(400).json({ error: 'Refund is already being processed.' });
    }
    if (order.payment.status !== 'paid') return res.status(400).json({ error: 'Refund not allowed for unpaid orders' });

    // 2. Get the transaction ID (mihpayid)
    const mihpayid = order.payment.payuPaymentId ||
      order.payment.attempts.find(a => a.status === 'success')?.mihpayid;

    if (!mihpayid) return res.status(400).json({ error: 'PayU Payment ID missing for this order' });

    // 3. Trigger actual PayU API call
    const amountRupees = (order.amount / 100).toFixed(2);

    if (order.refundStatus !== 'requested') {
      return res.status(409).json({ error: 'Refund already processed' });
    }
    order.refundStatus = 'processing';
    await order.save();

    const refundResult = await initiatePayURefund({ mihpayid, amountRupees });

    // 4. Handle PayU Response
    if (refundResult.status === 1) {
      order.refundStatus = 'refunded'; // Update to final state
      order.payment.status = 'refunded';
      order.payment.refundAmount = order.amount;
      order.payment.refundedAt = new Date();

      // Log the successful refund in attempts
      order.payment.attempts.push({
        txnid: `REFUND_${order.orderNumber}`,
        status: 'success',
        rawResponse: refundResult
      });

      await order.save();

      res.json({
        success: true,
        message: 'Refund successful at PayU and updated in DB',
        orderId: order._id,
        payuData: refundResult
      });
    } else {
      // If PayU rejects it (e.g. insufficient merchant balance)
      return res.status(400).json({
        error: 'PayU Gateway rejected refund',
        details: refundResult.msg
      });
    }
  } catch (err) {
    console.error('Approve refund error:', err);
    res.status(500).json({ error: 'Internal server error during refund processing' });
  }
});


/**
 * POST /api/admin/refunds/:orderId/reject
 * Reject a refund request (admin only)
 */

router.post('/refunds/:orderId/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Must be in requested state
    if (order.refundStatus !== 'requested') {
      return res.status(400).json({
        error: 'Refund cannot be rejected',
        message: `Current refund status is '${order.refundStatus}'`
      });
    }

    if (order.payment.status !== 'paid') {
      return res.status(400).json({
        error: 'Refund not allowed for unpaid orders'
      });
    }


    // Update state to close the request
    order.refundStatus = 'failed'; // Or 'failed' depending on your schema
    order.refundRequested = false;
    order.refundReason = reason || 'Rejected by admin';

    await order.save();

    res.json({
      success: true,
      message: 'Refund request rejected successfully',
      orderNumber: order.orderNumber
    });
  } catch (err) {
    console.error('Reject refund error:', err);

    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    res.status(500).json({ error: 'Failed to reject refund request' });
  }
});


/**
 * GET /api/admin/dashboard/stats
 * Get high-level summary for the admin dashboard
 */
// router.get('/dashboard/stats', async (req, res) => {
//   try {
//     const startOfToday = new Date();
//     startOfToday.setHours(0, 0, 0, 0);

//     const stats = await Promise.all([
//       Order.countDocuments({ status: 'confirmed' }),       // Orders to fulfill
//       Order.countDocuments({ refundStatus: 'requested' }), // Refunds to approve
//       Product.countDocuments({ inventory: { $lte: 5 } }),  // Low stock alert

//       // Total Revenue (all time paid orders)
//       Order.aggregate([
//         { $match: { 'payment.status': 'paid' } },
//         { $group: { _id: null, total: { $sum: "$amount" } } }
//       ]),

//       // Today's Revenue (paid orders since midnight)
//       Order.aggregate([
//         { 
//           $match: { 
//             'payment.status': 'paid', 
//             'payment.paidAt': { $gte: startOfToday } 
//           } 
//         },
//         { $group: { _id: null, total: { $sum: "$amount" } } }
//       ])
//     ]);

//     // Extract totals safely (Mongoose aggregation returns an array)
//     const totalRevenue = stats[3].length > 0 ? stats[3][0].total : 0;
//     const todayRevenue = stats[4].length > 0 ? stats[4][0].total : 0;

//     res.json({
//       success: true,
//       stats: {
//         pendingOrders: stats[0],
//         pendingRefunds: stats[1],
//         lowStockAlerts: stats[2],
//         totalRevenueRupees: (totalRevenue / 100).toFixed(2),
//         todayRevenueRupees: (todayRevenue / 100).toFixed(2),
//         currency: 'INR'
//       }
//     });
//   } catch (err) {
//     console.error('Dashboard stats error:', err);
//     res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
//   }
// });

router.get('/dashboard/stats', async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      pendingOrders,
      pendingRefunds,
      lowStockAlerts,
      totalRevenueAgg,
      todayRevenueAgg,
      totalRefundAgg,
      todayRefundAgg
    ] = await Promise.all([
      Order.countDocuments({ status: 'confirmed' }),
      Order.countDocuments({ refundStatus: 'requested' }),
      Product.countDocuments({ inventory: { $lte: 5 } }),

      // Gross revenue
      Order.aggregate([
        { $match: { 'payment.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      // Gross revenue today
      Order.aggregate([
        {
          $match: {
            'payment.status': 'paid',
            'payment.paidAt': { $gte: startOfToday }
          }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      // Total refunded amount
      Order.aggregate([
        { $match: { 'payment.status': 'refunded' } },
        { $group: { _id: null, total: { $sum: '$payment.refundAmount' } } }
      ]),

      // Refunded today
      Order.aggregate([
        {
          $match: {
            'payment.status': 'refunded',
            'payment.refundedAt': { $gte: startOfToday }
          }
        },
        { $group: { _id: null, total: { $sum: '$payment.refundAmount' } } }
      ])
    ]);

    const grossTotal = totalRevenueAgg[0]?.total || 0;
    const grossToday = todayRevenueAgg[0]?.total || 0;
    const refundedTotal = totalRefundAgg[0]?.total || 0;
    const refundedToday = todayRefundAgg[0]?.total || 0;

    res.json({
      success: true,
      stats: {
        pendingOrders,
        pendingRefunds,
        lowStockAlerts,

        grossRevenueRupees: (grossTotal / 100).toFixed(2),
        refundedRevenueRupees: (refundedTotal / 100).toFixed(2),
        netRevenueRupees: ((grossTotal - refundedTotal) / 100).toFixed(2),

        todayGrossRevenueRupees: (grossToday / 100).toFixed(2),
        todayRefundedRupees: (refundedToday / 100).toFixed(2),
        todayNetRevenueRupees: ((grossToday - refundedToday) / 100).toFixed(2),

        currency: 'INR'
      }
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});



export default router;
