import mongoose from 'mongoose';
const OrderItem = new mongoose.Schema({ productId: String, title: String, price: Number, qty: Number });
const OrderSchema = new mongoose.Schema({
  userId: String,
  items: [OrderItem],
  amount: Number,
  status: { type: String, default: 'pending' },
  shippingAddress: Object,
  payment: Object
}, { timestamps: true });
export default mongoose.model('Order', OrderSchema);
