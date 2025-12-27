import axios from 'axios';

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

let cachedToken = null;
let tokenExpiry = null;
let cachedPickupLocations = null;

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
   GET PICKUP LOCATIONS
===================================================== */
const getPickupLocations = async () => {
  if (cachedPickupLocations) {
    return cachedPickupLocations;
  }

  const token = await getShiprocketToken();

  const response = await axios.get(
    `${BASE_URL}/settings/company/pickup`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  cachedPickupLocations = response.data.data?.shipping_address || [];
  return cachedPickupLocations;
};

const getPickupLocationByName = async (locationName) => {
  const locations = await getPickupLocations();
  return locations.find(loc => loc.pickup_location === locationName) || locations[0];
};

/* =====================================================
   CREATE SHIPMENT FROM ORDER
===================================================== */
export const createShipmentFromOrder = async (order, userEmail = 'noreply@thevelvettails.com') => {
  const token = await getShiprocketToken();

  // Format order date as "YYYY-MM-DD HH:mm" (IST)
  const orderDate = new Date(order.createdAt);
  const formattedDate = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-${String(orderDate.getDate()).padStart(2, '0')} ${String(orderDate.getHours()).padStart(2, '0')}:${String(orderDate.getMinutes()).padStart(2, '0')}`;

  const payload = {
    order_id: order.orderNumber,
    order_date: formattedDate,
    pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary',

    billing_customer_name: order.shippingAddress.name,
    billing_phone: order.shippingAddress.phone,
    billing_address: order.shippingAddress.street,
    billing_city: order.shippingAddress.city,
    billing_state: order.shippingAddress.state,
    billing_pincode: order.shippingAddress.pincode,
    billing_country: order.shippingAddress.country || 'India',
    billing_email: userEmail,

    shipping_is_billing: true,

    order_items: order.items.map(item => ({
      name: item.title,
      sku: item.productId.toString(),
      units: item.qty,
      selling_price: Number((item.price / 100).toFixed(2))
    })),

    payment_method: order.payment.status === 'paid' ? 'PREPAID' : 'COD',
    sub_total: Number((order.subtotal / 100).toFixed(2)),
    length: 10,
    breadth: 10,
    height: 10,
    weight: 0.5
  };

  console.log('📦 Shiprocket Payload:', JSON.stringify(payload, null, 2));

  try {
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
  } catch (error) {
    // Log detailed error from Shiprocket
    console.error('❌ Shiprocket Error:', JSON.stringify(error.response?.data, null, 2));
    throw error;
  }
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

  // Get the pickup location details (same location used for shipping)
  const pickupLocationName = process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary';
  const pickupLocation = await getPickupLocationByName(pickupLocationName);

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

    // Delivery to warehouse (use same pickup location from Shiprocket)
    shipping_customer_name: pickupLocation?.name || process.env.SHIPROCKET_WAREHOUSE_NAME || 'The Velvet Tails',
    shipping_phone: pickupLocation?.phone || process.env.SHIPROCKET_WAREHOUSE_PHONE || '9429694910',
    shipping_address: pickupLocation?.address || process.env.SHIPROCKET_WAREHOUSE_ADDRESS || 'Warehouse Address',
    shipping_city: pickupLocation?.city || process.env.SHIPROCKET_WAREHOUSE_CITY || 'City',
    shipping_state: pickupLocation?.state || process.env.SHIPROCKET_WAREHOUSE_STATE || 'State',
    shipping_pincode: pickupLocation?.pin_code || process.env.SHIPROCKET_WAREHOUSE_PINCODE || '000000',
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
