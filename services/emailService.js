import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Validate email configuration in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SMTP_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('CRITICAL: Email configuration incomplete. Set SMTP_HOST, EMAIL_USER, EMAIL_PASS');
  }
}

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('[ERROR] Email transporter error:', error);
  } else {
    console.log('[SUCCESS] Email service ready');
  }
});

/**
 * Send email verification link
 */
export const sendVerificationEmail = async (email, name, token) => {
  try {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5174'}/verify-email?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Verify Your Email - The Velvet Tails',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #5C3975 0%, #8B5A9E 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { padding: 30px; background: #f9f9f9; }
            .verify-box { background: white; padding: 30px; margin: 20px 0; border-radius: 10px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .verify-button { display: inline-block; background: linear-gradient(135deg, #5C3975 0%, #8B5A9E 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; }
            .verify-button:hover { opacity: 0.9; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            .expires { color: #888; font-size: 13px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🐾 Welcome to The Velvet Tails!</h1>
            </div>
            
            <div class="content">
              <p>Hi ${name},</p>
              <p>Thank you for registering! Please verify your email address to complete your registration and start shopping.</p>
              
              <div class="verify-box">
                <h2>Verify Your Email</h2>
                <p>Click the button below to verify your email address:</p>
                <a href="${verificationUrl}" class="verify-button">Verify Email</a>
                <p class="expires">This link expires in 24 hours</p>
              </div>
              
              <p style="font-size: 13px; color: #666;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="font-size: 12px; color: #5C3975; word-break: break-all;">${verificationUrl}</p>
              
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
            
            <div class="footer">
              <p><strong>The Velvet Tails Team</strong></p>
              <p>Where Paws Meet Plush 🐾</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('[ERROR] Error sending verification email:', error.message);
    return false;
  }
};

/**
 * Send order confirmation email (after payment success)
 */
export const sendOrderConfirmationEmail = async (order, user) => {
  try {
    const itemsHtml = order.items.map(item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          ${item.productId?.name || item.title || 'Product'}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
          ${item.qty || item.quantity || 1}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          ₹${(item.price / 100).toFixed(2)}
        </td>
      </tr>
    `).join('');

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .order-box { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; padding-top: 15px; border-top: 2px solid #4F46E5; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Order Confirmed!</h1>
            </div>
            
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>Thank you for your order! We've received your payment and are processing your order.</p>
              
              <div class="order-box">
                <h2>Order #${order.orderNumber}</h2>
                <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN')}</p>
                
                <h3>Items:</h3>
                <table>
                  <thead>
                    <tr style="background: #f0f0f0;">
                      <th style="padding: 10px; text-align: left;">Product</th>
                      <th style="padding: 10px; text-align: center;">Quantity</th>
                      <th style="padding: 10px; text-align: right;">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemsHtml}
                  </tbody>
                </table>
                
                ${order.discount > 0 ? `<p style="color: green; margin: 10px 0;">Discount: -₹${(order.discount / 100).toFixed(2)}</p>` : ''}
                ${order.tax > 0 ? `<p style="margin: 10px 0;">Tax: ₹${(order.tax / 100).toFixed(2)}</p>` : ''}
                
                <div class="total">
                  Total Paid: ₹${(order.amount / 100).toFixed(2)}
                </div>
              </div>
              
              <div class="order-box">
                <h3>Delivery Address:</h3>
                <p>
                  ${order.shippingAddress.name}<br>
                  ${order.shippingAddress.address}<br>
                  ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}<br>
                  Phone: ${order.shippingAddress.phone}
                </p>
              </div>
              
              <p>We'll send you another email when your order ships with tracking information.</p>
            </div>
            
            <div class="footer">
              <p>Thank you for shopping with us!</p>
              <p><strong>The Velvet Tails Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Order confirmation email sent to ${user.email} for order ${order.orderNumber}`);
  } catch (error) {
    console.error('[ERROR] Error sending order confirmation email:', error);
  }
};

/**
 * Send shipping notification email
 */
export const sendShippingNotificationEmail = async (order, user) => {
  try {
    const trackingLink = order.logistics?.awb
      ? `https://shiprocket.co/tracking/${order.logistics.awb}`
      : '#';

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Order Shipped - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .tracking-box { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .track-button { display: inline-block; background: #10B981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 15px; font-weight: bold; }
            .track-button:hover { background: #059669; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Order Has Shipped!</h1>
            </div>
            
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>Great news! Your order has been shipped and is on its way to you.</p>
              
              <div class="tracking-box">
                <h2>Order #${order.orderNumber}</h2>
                ${order.logistics?.courierName ? `<p><strong>Courier:</strong> ${order.logistics.courierName}</p>` : ''}
                ${order.logistics?.awb ? `
                  <p style="font-size: 18px; margin: 15px 0;"><strong>Tracking Number:</strong><br>${order.logistics.awb}</p>
                  <a href="${trackingLink}" class="track-button">Track Your Order</a>
                ` : ''}
              </div>
              
              <div class="tracking-box">
                <h3>Delivery Address:</h3>
                <p>
                  ${order.shippingAddress.name}<br>
                  ${order.shippingAddress.address}<br>
                  ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.pincode}
                </p>
              </div>
              
              <p>You'll receive your order soon. Thank you for your patience!</p>
            </div>
            
            <div class="footer">
              <p><strong>The Velvet Tails Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Shipping notification email sent to ${user.email} for order ${order.orderNumber}`);
  } catch (error) {
    console.error('[ERROR] Error sending shipping notification email:', error);
  }
};

/**
 * Send refund approval email
 */
export const sendRefundApprovalEmail = async (order, user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Refund Approved - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .refund-box { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .amount { font-size: 24px; color: #10B981; font-weight: bold; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Refund Approved</h1>
            </div>
            
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>Your refund request has been approved!</p>
              
              <div class="refund-box">
                <h2>Order #${order.orderNumber}</h2>
                <div class="amount">₹${(order.amount / 100).toFixed(2)}</div>
                <p><strong>Status:</strong> Processing</p>
                <p>The refund will be credited to your original payment method within <strong>5-7 business days</strong>.</p>
              </div>
              
              <p>Thank you for your patience. If you have any questions, feel free to contact us at ${process.env.ADMIN_EMAIL}</p>
            </div>
            
            <div class="footer">
              <p><strong>The Velvet Tails Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Refund approval email sent to ${user.email} for order ${order.orderNumber}`);
  } catch (error) {
    console.error('[ERROR] Error sending refund approval email:', error);
  }
};

/**
 * Send refund rejection email
 */
export const sendRefundRejectionEmail = async (order, user, reason) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Refund Update - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #EF4444; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .refund-box { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .reason-box { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin: 15px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Refund Request Update</h1>
            </div>
            
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>We've reviewed your refund request for order #${order.orderNumber}.</p>
              
              <div class="refund-box">
                <h2>Order #${order.orderNumber}</h2>
                <p><strong>Status:</strong> Refund request declined</p>
                
                <div class="reason-box">
                  <strong>Reason:</strong><br>
                  ${reason}
                </div>
              </div>
              
              <p>If you have any questions or concerns about this decision, please contact our support team at <strong>${process.env.ADMIN_EMAIL}</strong></p>
              <p>We're here to help!</p>
            </div>
            
            <div class="footer">
              <p><strong>The Velvet Tails Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Refund rejection email sent to ${user.email} for order ${order.orderNumber}`);
  } catch (error) {
    console.error('[ERROR] Error sending refund rejection email:', error);
  }
};

/**
 * Send order cancellation email
 */
export const sendOrderCancellationEmail = async (order, user) => {
  try {
    const refundInfo = order.payment.status === 'paid'
      ? '<p style="background: #FEF3C7; padding: 15px; border-radius: 5px; border-left: 4px solid #F59E0B;"><strong>Refund Status:</strong> Your payment will be refunded within 5-7 business days.</p>'
      : '';

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Order Cancelled - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #6B7280; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { padding: 20px; background: #f9f9f9; }
            .cancel-box { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Order Cancelled</h1>
            </div>
            
            <div class="content">
              <p>Hi ${user.name},</p>
              <p>Your order has been cancelled as requested.</p>
              
              <div class="cancel-box">
                <h2>Order #${order.orderNumber}</h2>
                <p><strong>Cancelled on:</strong> ${new Date(order.cancelledAt).toLocaleDateString('en-IN')}</p>
                ${order.cancellationReason ? `<p><strong>Reason:</strong> ${order.cancellationReason}</p>` : ''}
                
                ${refundInfo}
              </div>
              
              <p>We're sorry to see you go. If there's anything we can do to improve your experience, please let us know at ${process.env.ADMIN_EMAIL}</p>
            </div>
            
            <div class="footer">
              <p><strong>The Velvet Tails Team</strong></p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SUCCESS] Order cancellation email sent to ${user.email} for order ${order.orderNumber}`);
  } catch (error) {
    console.error('[ERROR] Error sending order cancellation email:', error);
  }
};

export const sendDeliveryEmail = async (order, userEmail) => {
  const subject = `Order Delivered - ${order.orderNumber}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px">
      <h2>🎉 Your order has been delivered!</h2>

      <p>
        Hi,<br/><br/>
        Your order <strong>${order.orderNumber}</strong> has been successfully delivered.
      </p>

      <h3>Delivery Address</h3>
      <p>
        ${order.shippingAddress.name}<br/>
        ${order.shippingAddress.street}<br/>
        ${order.shippingAddress.city}, ${order.shippingAddress.state}<br/>
        ${order.shippingAddress.pincode}
      </p>

      <h3>Order Summary</h3>
      <ul>
        ${order.items
      .map(
        item =>
          `<li>${item.title} × ${item.qty}</li>`
      )
      .join('')}
      </ul>

      <p>
        If you need any help, just reply to this email.<br/><br/>
        ❤️ Thank you for shopping with us!
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Velvet Tails" <${process.env.EMAIL_FROM}>`,
    to: userEmail,
    subject,
    html
  });
};
