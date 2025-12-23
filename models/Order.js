import mongoose from 'mongoose';
const OrderItem = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  }, title: { type: String, required: true },
  price: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Item price must be in paise (integer)'
    }
  }
  ,
  qty: { type: Number, required: true, min: 1 }
});


const OrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: {
    type: [OrderItem],
    required: true,
    validate: v => v.length > 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
    validate: Number.isInteger
  },
  tax: {
    type: Number,
    default: 0,
    min: 0,
    validate: Number.isInteger
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: 0,
    validate: Number.isInteger
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    validate: Number.isInteger
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
    validate: Number.isInteger
  },        // Final total
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  logistics: {
    provider: { type: String }, // 'shiprocket'
    shipmentId: String,
    orderId: String,
    awb: String,
    courierName: String,
    status: {
  type: String,
  enum: ['created', 'shipped', 'in_transit', 'delivered', 'rto', 'cancelled']
}
,deliveryNotified: {
  type: Boolean,
  default: false
}
,
    shippedAt: Date,
    deliveredAt: Date
  }
  ,
  cancelledBy: {
    type: String,
    enum: ['user', 'system', 'admin'],
  }
  ,
  cancelledAt: Date,
  cancellationReason: String,
  inventoryRestored: {
    type: Boolean,
    default: false
  },

  shippingAddress: {
    name: { type: String, required: true },
    phone: { type: String, required: true, match: [/^[6-9]\d{9}$/, 'Invalid phone number'] },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true, match: [/^\d{6}$/, 'Invalid pincode'] },
    country: { type: String, default: 'India' }
  },
  payment: {
    method: { type: String, enum: ['payu'], default: 'payu', required: true },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded', 'verification_failed'], default: 'pending' },
    payuOrderId: String,
    payuTransactionId: String,
    payuPaymentId: String,
    paidAt: Date,
    refundedAt: Date,
    refundAmount: {
      type: Number,
      min: 0,
      validate: Number.isInteger
    },
    attempts: [
      {
        txnid: { type: String, required: true },
        mihpayid: { type: String },
        amountPaise: {
          type: Number,
          required: true,
          validate: Number.isInteger
        },
        status: {
          type: String,
          enum: ['initiated', 'success', 'failed'],
          required: true
        },
        rawResponse: {
          type: mongoose.Schema.Types.Mixed
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  refundRequested: {
    type: Boolean,
    default: false
  },
  refundRequestedAt: Date,
  refundReason: String,
  refundStatus: {
    type: String,
    enum: ['none', 'requested', 'processing', 'refunded', 'failed'],
    default: 'none'
  },

  orderNumber: { type: String, unique: true }
}, { timestamps: true });

// Auto-generate before save
OrderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `VT-${new Date().getFullYear()}-${this._id.toString().slice(-6).toUpperCase()}`;
  }
  next();
});


// Indexes
OrderSchema.index({ userId: 1, createdAt: -1 });   // User's orders
OrderSchema.index({ status: 1 });                   // Filter by status
OrderSchema.index({ orderNumber: 1 });              // Search by order number
OrderSchema.index({ 'payment.payuTransactionId': 1 }); // Payment lookup

OrderSchema.methods.calculateTotal = function () {
  const subtotal = this.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  return subtotal + this.tax + this.shippingCost - this.discount;
};
OrderSchema.methods.canBeCancelled = function () {
  if (this.logistics?.awb) return false;
  return ['pending', 'confirmed'].includes(this.status);
};

OrderSchema.methods.validateAmount = function () {
  const calculated = this.calculateTotal();
  return this.amount === calculated;

};

OrderSchema.methods.canBeCancelled = function () {
  // Order can only be cancelled if it's pending or confirmed (not yet shipped)
  return ['pending', 'confirmed'].includes(this.status);
};

OrderSchema.methods.canBeRefunded = function () {
  // must be paid
  if (this.payment.status !== 'paid') return false;

  // must be cancelled
  if (this.status !== 'cancelled') return false;

  // system-expired orders never get refunds
  if (this.cancelledBy === 'system') return false;

  return true;
};


OrderSchema.pre('save', function (next) {
  if (!this.validateAmount()) {
    return next(new Error(`Amount mismatch: expected ${this.calculateTotal()}, got ${this.amount}`));
  }
  next();
});

export default mongoose.model('Order', OrderSchema);
