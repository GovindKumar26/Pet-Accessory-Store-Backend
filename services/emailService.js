import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,        // e.g. smtp.gmail.com
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendDeliveryEmail = async (order, userEmail) => {
  const subject = `📦 Order Delivered – ${order.orderNumber}`;

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
