import express from "express";
import crypto from "crypto";
import Order from "../models/Order.js";

const router = express.Router();

router.post("/razorpay", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const razorpaySignature = req.headers["x-razorpay-signature"];

    //  Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    //  Parse event
    const event = JSON.parse(req.body.toString());

    //  Handle payment captured
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;

      const razorpayOrderId = payment.order_id;
      const razorpayPaymentId = payment.id;
      const amount = payment.amount;

      //  Find order linked to this Razorpay order
      const order = await Order.findOne({
        "payment.razorpayOrderId": razorpayOrderId
      });

      if (!order) {
        return res.status(200).json({ message: "Order not found" });
      }

      //  Idempotency check
      if (order.payment.status === "paid") {
        return res.status(200).json({ message: "Already processed" });
      }

      //  Amount check (extra safety)
      const expectedAmount = Math.round(order.amount * 100);
      if (amount !== expectedAmount) {
        return res.status(400).json({ error: "Amount mismatch" });
      }

      //  Mark order as paid
      order.payment.status = "paid";
      order.payment.razorpayPaymentId = razorpayPaymentId;
      order.payment.paidAt = new Date();
      order.status = "confirmed";

      await order.save();
    }

    res.status(200).json({ received: true });

  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
