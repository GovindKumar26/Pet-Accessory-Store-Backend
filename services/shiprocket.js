import axios from 'axios';

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let tokenExpiry = null;

/* =====================================================
   AUTHENTICATION
===================================================== */
const shiprocketLogin = async () => {
  const response = await axios.post(`${BASE_URL}/auth/login`, {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD
  });

  cachedToken = response.data.token;

  // Token validity ≈ 24h (safe buffer)
  tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);

  return cachedToken;
};

const getShiprocketToken = async () => {
  if (!cachedToken || !tokenExpiry || Date.now() > tokenExpiry) {
    await shiprocketLogin();
  }
  return cachedToken;
};

/* =====================================================
   CREATE SHIPMENT FROM ORDER
===================================================== */
export const createShipmentFromOrder = async (order) => {
  const token = await getShiprocketToken();

  const payload = {
    order_id: order.orderNumber,
    order_date: new Date(order.createdAt).toISOString().split('T')[0],
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',

    billing_customer_name: order.shippingAddress.name,
    billing_phone: order.shippingAddress.phone,
    billing_address: order.shippingAddress.street,
    billing_city: order.shippingAddress.city,
    billing_state: order.shippingAddress.state,
    billing_pincode: order.shippingAddress.pincode,
    billing_country: order.shippingAddress.country || 'India',

    shipping_is_billing: true,

    order_items: order.items.map(item => ({
      name: item.title,
      sku: item.productId.toString(),
      units: item.qty,
      selling_price: (item.price / 100).toFixed(2)
    })),

    payment_method: order.payment.status === 'paid' ? 'Prepaid' : 'COD',
    sub_total: (order.subtotal / 100).toFixed(2),
    length: 10,
    breadth: 10,
    height: 10,
    weight: 0.5
  };

  const response = await axios.post(
    `${BASE_URL}/orders/create/adhoc`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.data;
};

/* =====================================================
   TRACK SHIPMENT
===================================================== */
export const trackShipmentByAWB = async (awb) => {
  const token = await getShiprocketToken();

  const response = await axios.get(
    `${BASE_URL}/courier/track/awb/${awb}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.data;
};

/* =====================================================
   CANCEL SHIPMENT (OPTIONAL)
===================================================== */
export const cancelShipment = async (shipmentId) => {
  const token = await getShiprocketToken();

  const response = await axios.post(
    `${BASE_URL}/orders/cancel`,
    { ids: [shipmentId] },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.data;
};

/* =====================================================
   CREATE RETURN PICKUP (REVERSE SHIPMENT)
===================================================== */
export const createReturnPickup = async (order) => {
  const token = await getShiprocketToken();

  // Create return order using Shiprocket's return API
  const payload = {
    order_id: `RET-${order.orderNumber}`,
    order_date: new Date().toISOString().split('T')[0],
    channel_id: '', // Will use default channel

    // Pickup from customer (customer's address becomes pickup)
    pickup_customer_name: order.shippingAddress.name,
    pickup_phone: order.shippingAddress.phone,
    pickup_address: order.shippingAddress.street,
    pickup_city: order.shippingAddress.city,
    pickup_state: order.shippingAddress.state,
    pickup_pincode: order.shippingAddress.pincode,
    pickup_country: order.shippingAddress.country || 'India',

    // Delivery to warehouse (use primary pickup location)
    shipping_customer_name: process.env.SHIPROCKET_WAREHOUSE_NAME || 'The Velvet Tails',
    shipping_phone: process.env.SHIPROCKET_WAREHOUSE_PHONE || '9429694910',
    shipping_address: process.env.SHIPROCKET_WAREHOUSE_ADDRESS || 'Warehouse Address',
    shipping_city: process.env.SHIPROCKET_WAREHOUSE_CITY || 'City',
    shipping_state: process.env.SHIPROCKET_WAREHOUSE_STATE || 'State',
    shipping_pincode: process.env.SHIPROCKET_WAREHOUSE_PINCODE || '000000',
    shipping_country: 'India',

    order_items: order.items.map(item => ({
      name: item.title,
      sku: item.productId.toString(),
      units: item.qty,
      selling_price: (item.price / 100).toFixed(2)
    })),

    payment_method: 'Prepaid',
    sub_total: (order.subtotal / 100).toFixed(2),
    length: 10,
    breadth: 10,
    height: 10,
    weight: 0.5
  };

  const response = await axios.post(
    `${BASE_URL}/orders/create/return`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.data;
};
