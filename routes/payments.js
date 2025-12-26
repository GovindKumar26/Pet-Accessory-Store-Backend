import express from 'express';
import crypto from 'crypto';
import Order from '../models/Order.js';
import User from '../models/User.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import { authenticate } from '../middleware/auth.js';
import { restoreInventory } from '../utils/inventory.js';

const router = express.Router();

// PayU configuration
const PAYU_CONFIG = {
  merchantKey: process.env.PAYU_MERCHANT_KEY,
  merchantSalt: process.env.PAYU_MERCHANT_SALT,
  baseUrl: process.env.NODE_ENV === 'production'
    ? 'https://secure.payu.in/_payment'  // Production
    : 'https://test.payu.in/_payment'     // Test
};

// Generate PayU hash (SHA512)
// const generatePayUHash = (data, salt) => {
//   const hashString = `${data.key}|${data.txnid}|${data.amount}|${data.productinfo}|${data.firstname}|${data.email}|${data.udf1 || ''}|${data.udf2 || ''}|${data.udf3 || ''}|${data.udf4 || ''}|${data.udf5 || ''}||||||${salt}`;
//   return crypto.createHash('sha512').update(hashString).digest('hex');
// };


const generatePayUHash = (data, salt) => {

  const key = data.key;
  const txnid = data.txnid;
  const amount = data.amount;
  const productinfo = data.productinfo;
  const firstname = data.firstname;
  const email = data.email;
  const udf1 = data.udf1 || '';
  const udf2 = data.udf2 || '';
  const udf3 = data.udf3 || '';
  const udf4 = data.udf4 || '';
  const udf5 = data.udf5 || '';


  // Construct hash string with exact parameter sequence
  // Construct hash string with exact parameter sequence
  const hashString = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;

  console.log('PayU HASH STRING:', hashString);

  return crypto
    .createHash('sha512')
    .update(hashString)
    .digest('hex');
};



// // Verify PayU response hash
// const verifyPayUHash = (data, salt) => {
//   const hashString = `${salt}|${data.status}|||||||||||${data.udf5 || ''}|${data.udf4 || ''}|${data.udf3 || ''}|${data.udf2 || ''}|${data.udf1 || ''}|${data.email}|${data.firstname}|${data.productinfo}|${data.amount}|${data.txnid}|${data.key}`;
//   const generatedHash = crypto.createHash('sha512').update(hashString).digest('hex');
//   return generatedHash === data.hash;
// };

// const verifyPayUHash = (data, salt) => {
//   const hashSequence = [
//     salt,
//     data.status,
//     '', '', '', '', '', '', '', '', '', '',
//     data.udf5 || '',
//     data.udf4 || '',
//     data.udf3 || '',
//     data.udf2 || '',
//     data.udf1 || '',
//     data.email,
//     data.firstname,
//     data.productinfo,
//     data.amount,
//     data.txnid,
//     data.key
//   ].join('|');

//   const generatedHash = crypto
//     .createHash('sha512')
//     .update(hashSequence)
//     .digest('hex');

//   return generatedHash === data.hash;
// };
// const verifyPayUHash = (data, salt) => {
//   const hashString =
//     salt + '|' +
//     data.status + '|' +
//     '||||||||||' +    // ✅ ELEVEN pipes (10 empty additional_charges fields)
//     (data.udf5 || '') + '|' +
//     (data.udf4 || '') + '|' +
//     (data.udf3 || '') + '|' +
//     (data.udf2 || '') + '|' +
//     (data.udf1 || '') + '|' +
//     data.email + '|' +
//     data.firstname + '|' +
//     data.productinfo + '|' +
//     data.amount + '|' +
//     data.txnid + '|' +
//     data.key;

//   console.log('PayU VERIFY HASH STRING:', hashString);

//   const generatedHash = crypto
//     .createHash('sha512')
//     .update(hashString)
//     .digest('hex');

//   console.log('Generated hash:', generatedHash);
//   console.log('Received hash:', data.hash);

//   return generatedHash === data.hash;
// };

// const verifyPayUHash = (data, salt) => {
//   // Log all incoming data for debugging
//   console.log('=== PayU Response Verification ===');
//   console.log('Received data:', JSON.stringify(data, null, 2));
//   console.log('Salt:', salt);

//   const hashString =
//     salt + '|' +
//     data.status + '|' +
//     '|||||||||' +   // ✅ 9 pipes (9 empty additional_charges fields, then udf5, then udf4 = 11 total before udf3)
//     (data.udf5 || '') + '|' +
//     (data.udf4 || '') + '|' +
//     (data.udf3 || '') + '|' +
//     (data.udf2 || '') + '|' +
//     (data.udf1 || '') + '|' +
//     data.email + '|' +
//     data.firstname + '|' +
//     data.productinfo + '|' +
//     data.amount + '|' +
//     data.txnid + '|' +
//     data.key;

//   console.log('Verification Hash String:', hashString);

//   const generatedHash = crypto
//     .createHash('sha512')
//     .update(hashString)
//     .digest('hex');

//   console.log('Generated hash:', generatedHash);
//   console.log('Received hash:', data.hash);
//   console.log('Match:', generatedHash === data.hash);
//   console.log('=================================');

//   return generatedHash === data.hash;
// };

const verifyPayUHash = (data, salt) => {
  // 1. PayU Reverse Hash Formula:
  // sha512( [additionalCharges|]salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key )

  // 2. Handle additionalCharges (Only prepend if it exists in the response)
  let hashString = data.additionalCharges
    ? `${data.additionalCharges}|${salt}|${data.status}`
    : `${salt}|${data.status}`;

  // 3. Construct the middle section (udf10 down to udf6)
  // Even if empty, these must be represented by pipes.
  // This results in 5 pipes between status and udf5.
  const udfSection = [
    data.udf10 || '',
    data.udf9 || '',
    data.udf8 || '',
    data.udf7 || '',
    data.udf6 || '',
    data.udf5 || '',
    data.udf4 || '',
    data.udf3 || '',
    data.udf2 || '',
    data.udf1 || '',
    data.email || '',
    data.firstname || '',
    data.productinfo || '',
    data.amount || '',
    data.txnid || '',
    data.key || ''
  ].join('|');

  const finalHashString = `${hashString}|${udfSection}`;

  console.log('--- PayU Verification Debug ---');
  console.log('Final Hash String:', finalHashString);

  const generatedHash = crypto
    .createHash('sha512')
    .update(finalHashString)
    .digest('hex');

  console.log('Generated:', generatedHash);
  console.log('Received: ', data.hash);

  return generatedHash === data.hash;
};




// Initiate PayU payment for an order
router.post('/:orderId/initiate', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate orderId format
    if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    // Find the order and verify ownership
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to access this order' });
    }

    // Check if order is already paid
    if (order.payment.status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot initiate payment for order in '${order.status}' state`
      });
    }


    // Check if order is cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot pay for a cancelled order' });
    }

    // Check PayU credentials
    if (!PAYU_CONFIG.merchantKey || !PAYU_CONFIG.merchantSalt) {
      return res.status(500).json({ error: 'Payment gateway not configured' });
    }

    // Prepare PayU payment data
    // let txnid = order.payment.payuTransactionId;

    // if (!txnid) {
    //   txnid = `TXN_${order._id}_${Date.now()}`;
    //   order.payment.payuTransactionId = txnid;
    //   await order.save();
    // }

    const txnid = `TXN_${order._id}_${Date.now()}`;

    order.payment.payuTransactionId = txnid;
    await order.save();


    //  const txnid = `TXN${Date.now()}${Math.random().toString(36).substring(7).toUpperCase()}`;
    const payuData = {
      key: PAYU_CONFIG.merchantKey,
      txnid: txnid,
      amount: (order.amount / 100).toFixed(2), // ✅ paise → rupees
      productinfo: `Order ${order.orderNumber}`,
      firstname: order.shippingAddress.name.split(' ')[0],
      email: req.user.email,
      phone: order.shippingAddress.phone,
      surl: `${process.env.BACKEND_URL}/api/payments/success`,      // Backend Success URL
      furl: `${process.env.BACKEND_URL}/api/payments/failure`,      // Backend Failure URL
      udf1: order._id.toString(),           // Store orderId
      udf2: order.orderNumber,              // Store orderNumber
      udf3: req.user._id.toString(),        // Store userId
      udf4: '',
      udf5: ''
    };

    // Generate hash
    const hash = generatePayUHash(payuData, PAYU_CONFIG.merchantSalt);

    // Store transaction ID in order
    // order.payment.payuTransactionId = txnid;
    // await order.save();

    // Return payment data to frontend
    res.json({
      success: true,
      paymentData: {
        ...payuData,
        hash: hash,
        payuUrl: PAYU_CONFIG.baseUrl
      }
    });

  } catch (error) {
    console.error('PayU payment initiation error:', error);
    res.status(500).json({ error: 'Failed to initiate payment' });
  }
});

router.post('/success', async (req, res) => {
  try {
    const payuResponse = req.body;
    console.log('PayU Success Callback:', payuResponse);

    // 1. Extract orderId FIRST
    const orderId = payuResponse.udf1;
    if (!orderId) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?error_Message=${encodeURIComponent('Order ID not found')}`);
    }

    // 2. Fetch order
    // In /success and /failure
    const order = await Order.findById(orderId).populate('items.productId');
    if (!order) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?error_Message=${encodeURIComponent('Order not found')}`);
    }

    // 3. Verify hash AFTER fetching order
    if (!verifyPayUHash(payuResponse, PAYU_CONFIG.merchantSalt)) {
      order.payment.status = 'verification_failed';

      order.payment.attempts.push({
        txnid: payuResponse.txnid,
        mihpayid: payuResponse.mihpayid,
        amountPaise: Math.round(Number(payuResponse.amount) * 100),
        status: 'failed',
        rawResponse: payuResponse
      });

      await order.save();
      console.error('Invalid PayU hash signature');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?orderId=${orderId}&error_Message=${encodeURIComponent('Payment verification failed')}`);
    }

    // 4. Ignore if already cancelled
    if (order.status === 'cancelled') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?orderId=${orderId}&error_Message=${encodeURIComponent('Order was already cancelled')}`);
    }

    // 5. Record payment attempt
    order.payment.attempts.push({
      txnid: payuResponse.txnid,
      mihpayid: payuResponse.mihpayid,
      amountPaise: Math.round(Number(payuResponse.amount) * 100),
      status: payuResponse.status === 'success' ? 'success' : 'failed',
      rawResponse: payuResponse
    });

    // 6. Handle success
    if (payuResponse.status === 'success') {
      if (order.payment.status !== 'paid') {
        order.payment.status = 'paid';
        order.payment.paidAt = new Date();

        // set ONLY ONCE
        if (!order.payment.payuTransactionId) {
          order.payment.payuTransactionId = payuResponse.txnid;
          order.payment.payuPaymentId = payuResponse.mihpayid;
        }

        order.status = 'confirmed';

        // Send order confirmation email
        try {
          const user = await User.findById(order.userId);
          if (user) {
            await sendOrderConfirmationEmail(order, user);
          }
        } catch (emailError) {
          console.error('Email sending failed (non-critical):', emailError);
        }
      }
    }
    // 7. Handle failure
    else {
      if (order.payment.status !== 'paid') {
        order.payment.status = 'failed';
        order.status = 'cancelled';
        order.cancelledBy = 'system';
        order.cancellationReason = 'Payment failed';
        order.cancelledAt = new Date();

        await restoreInventory(order);
      }
    }

    await order.save();

    // Redirect user to frontend success page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/payment/success?orderId=${orderId}&status=${payuResponse.status}`);

  } catch (error) {
    console.error('PayU success callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/payment/failure?error_Message=${encodeURIComponent('Error processing payment')}`);
  }
});


router.post('/failure', async (req, res) => {
  try {
    const payuResponse = req.body;
    console.log('PayU Failure Callback:', payuResponse);

    // 1. Extract orderId first
    const orderId = payuResponse.udf1;
    if (!orderId) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?error_Message=${encodeURIComponent('Order ID not found')}`);
    }

    // 2. Fetch order
    // In /success and /failure
    const order = await Order.findById(orderId).populate('items.productId');
    if (!order) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?error_Message=${encodeURIComponent('Order not found')}`);
    }

    // 3. Verify hash AFTER fetching order
    if (!verifyPayUHash(payuResponse, PAYU_CONFIG.merchantSalt)) {
      order.payment.status = 'verification_failed';

      order.payment.attempts.push({
        txnid: payuResponse.txnid,
        amountPaise: Math.round(Number(payuResponse.amount || 0) * 100),
        status: 'failed',
        rawResponse: payuResponse
      });

      await order.save();
      console.error('Invalid PayU hash signature');
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/failure?orderId=${orderId}&error_Message=${encodeURIComponent('Payment verification failed')}`);
    }

    // 4. Ignore if already paid
    if (order.payment.status === 'paid') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/payment/success?orderId=${orderId}&status=success`);
    }

    // 5. Record failure attempt
    order.payment.attempts.push({
      txnid: payuResponse.txnid,
      mihpayid: payuResponse.mihpayid,
      amountPaise: Math.round(Number(payuResponse.amount || 0) * 100),
      status: 'failed',
      rawResponse: payuResponse
    });

    // 6. Mark order failed + cancelled
    order.payment.status = 'failed';
    order.status = 'cancelled';
    order.cancelledBy = 'system';
    order.cancellationReason = 'Payment failed';
    order.cancelledAt = new Date();

    // 7. Restore inventory ONCE
    if (!order.inventoryRestored) {
      await restoreInventory(order);
      order.inventoryRestored = true;
    }

    await order.save();
    console.log(`Order ${order.orderNumber} payment failed`);

    // Redirect user to frontend failure page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const errorMessage = payuResponse.error_Message || payuResponse.field9 || 'Payment failed';
    return res.redirect(`${frontendUrl}/payment/failure?orderId=${orderId}&error_Message=${encodeURIComponent(errorMessage)}`);

  } catch (error) {
    console.error('PayU failure callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/payment/failure?error_Message=${encodeURIComponent('Error processing payment failure')}`);
  }
});


// Get payment status for an order (authenticated)
router.get('/:orderId/status', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate orderId format
    if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    // Find order and verify ownership
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Unauthorized to access this order' });
    }

    res.json({
      success: true,
      payment: {
        status: order.payment.status,
        method: order.payment.method,
        paidAt: order.payment.paidAt,
        transactionId: order.payment.payuTransactionId,
        paymentId: order.payment.payuPaymentId
      },
      orderStatus: order.status
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

export default router;
