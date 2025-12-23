import { trackShipmentByAWB } from './shiprocket.js';
import { sendDeliveryEmail } from './emailService.js';
import User from '../models/User.js';


/**
 * Map Shiprocket status → internal logistics status
 * IMPORTANT:
 * - logistics.status = detailed courier state
 * - order.status = business state (enum-safe)
 */
const mapShiprocketStatus = (shiprocketStatus) => {
    if (!shiprocketStatus) return null;

    const status = shiprocketStatus.toUpperCase();

    switch (status) {
        case 'PICKED_UP':
        case 'IN_TRANSIT':
        case 'REACHED_AT_DESTINATION':
            return 'in_transit';

        case 'OUT_FOR_DELIVERY':
            return 'out_for_delivery';

        case 'DELIVERED':
            return 'delivered';

        case 'RTO_INITIATED':
        case 'RTO_DELIVERED':
            return 'rto';

        default:
            return 'shipped';
    }
};

/**
 * Sync tracking status from Shiprocket into DB
 * - Safe to call multiple times (idempotent)
 * - Only updates when status changes
 */
export const syncOrderTracking = async (order) => {
    // 1️⃣ No shipment → nothing to sync
    if (!order.logistics?.awb) {
        return { order, synced: false };
    }

    // 2️⃣ Fetch latest tracking from Shiprocket
    const trackingResponse = await trackShipmentByAWB(order.logistics.awb);

    const shipmentTrack =
        trackingResponse?.tracking_data?.shipment_track?.[0];

    if (!shipmentTrack || !shipmentTrack.current_status) {
        return { order, synced: false };
    }

    // 3️⃣ Map Shiprocket → internal status
    const mappedStatus = mapShiprocketStatus(shipmentTrack.current_status);

    if (!mappedStatus) {
        return { order, synced: false };
    }

    let updated = false;

    // 4️⃣ Update logistics.status if changed
    if (order.logistics.status !== mappedStatus) {
        order.logistics.status = mappedStatus;
        updated = true;
    }

    // 5️⃣ If delivered → update order.status (enum-safe)
    if (
        mappedStatus === 'delivered' &&
        order.status !== 'delivered'
    ) {
        order.status = 'delivered';
        order.logistics.deliveredAt = new Date();

        // Send delivery email (ONCE)
        if (!order.deliveryNotified) {
            const user = await User.findById(order.userId).select('email');

            if (user?.email) {
                await sendDeliveryEmail(order, user.email);
                order.deliveryNotified = true;
            }
        }

        updated = true;
    }

    // 6️⃣ Persist only if something changed
    if (updated) {
        await order.save();
    }

    return {
        order,
        synced: updated,
        shiprocketStatus: shipmentTrack.current_status,
        logisticsStatus: mappedStatus,
        rawTracking: trackingResponse
    };
};
