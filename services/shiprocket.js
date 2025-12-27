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

  // Log the pickup location being used
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary';
  console.log('📍 Shiprocket Pickup Location (from env):', pickupLocation);
  console.log('📍 SHIPROCKET_PICKUP_LOCATION env var:', process.env.SHIPROCKET_PICKUP_LOCATION);

  // Fetch and log all pickup locations from Shiprocket dashboard
  try {
    const dashboardLocations = await getPickupLocations();
    console.log('📍 Shiprocket Dashboard Pickup Locations:', dashboardLocations.map(loc => ({
      name: loc.pickup_location,
      id: loc.id,
      city: loc.city
    })));
  } catch (err) {
    console.log('⚠️ Could not fetch dashboard pickup locations:', err.message);
  }
  const orderDate = new Date(order.createdAt);
  const formattedDate = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}-${String(orderDate.getDate()).padStart(2, '0')} ${String(orderDate.getHours()).padStart(2, '0')}:${String(orderDate.getMinutes()).padStart(2, '0')}`;

  const payload = {
    order_id: order.orderNumber,
    order_date: formattedDate,
    pickup_location: pickupLocation,

    // Split name into first and last (Shiprocket requires both)
    billing_customer_name: order.shippingAddress.name.split(' ')[0] || order.shippingAddress.name,
    billing_last_name: order.shippingAddress.name.split(' ').slice(1).join(' ') || 'NA',
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

    // Shiprocket API expects "Prepaid" or "COD" (not all-caps "PREPAID")
    payment_method: order.payment.status === 'paid' ? 'Prepaid' : 'COD',
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
        },
        timeout: 30000 // 30 second timeout
      }
    );

    console.log('✅ Shiprocket Order Response:', JSON.stringify(response.data, null, 2));

    const orderData = response.data;

    // If AWB wasn't assigned automatically, assign courier manually
    if (orderData.shipment_id && !orderData.awb_code) {
      console.log('📦 AWB not assigned. Requesting courier assignment...');

      try {
        const awbResponse = await axios.post(
          `${BASE_URL}/courier/assign/awb`,
          { shipment_id: orderData.shipment_id },
          {
            headers: {
              Authorization: `Bearer ${token}`
            },
            timeout: 30000
          }
        );

        console.log('✅ Courier Assignment Response:', JSON.stringify(awbResponse.data, null, 2));

        // Merge the AWB data into the response
        return {
          ...orderData,
          awb_code: awbResponse.data.response?.data?.awb_code || awbResponse.data.awb_code,
          courier_name: awbResponse.data.response?.data?.courier_name || awbResponse.data.courier_name,
          courier_company_id: awbResponse.data.response?.data?.courier_company_id
        };
      } catch (awbError) {
        console.error('⚠️ Courier assignment failed:', awbError.response?.data || awbError.message);
        // Return the order data anyway - AWB can be assigned later from Shiprocket dashboard
        return {
          ...orderData,
          awb_code: null,
          courier_name: 'Pending Assignment'
        };
      }
    }

    return orderData;
  } catch (error) {
    // Log detailed error from Shiprocket
    console.error('❌ Shiprocket Error:', error.response?.status, JSON.stringify(error.response?.data, null, 2));

    // If 5xx error (server error), try once more with fresh token
    if (error.response?.status >= 500 && error.response?.status < 600) {
      console.log('🔄 Retrying with fresh token...');
      cachedToken = null;  // Force token refresh
      tokenExpiry = null;

      const freshToken = await getShiprocketToken();

      try {
        const retryResponse = await axios.post(
          `${BASE_URL}/orders/create/adhoc`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${freshToken}`
            },
            timeout: 30000
          }
        );
        console.log('✅ Shiprocket Retry Response:', JSON.stringify(retryResponse.data, null, 2));
        return retryResponse.data;
      } catch (retryError) {
        console.error('❌ Shiprocket Retry Error:', retryError.response?.status, JSON.stringify(retryError.response?.data, null, 2));
        throw retryError;
      }
    }

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
