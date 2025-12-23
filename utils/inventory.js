import Product from '../models/Product.js';

export const restoreInventory = async (order) => {
    if (!order || !order.items?.length) return;

    if (order.inventoryRestored) return;


    for (const item of order.items) {
        await Product.findByIdAndUpdate(
            item.productId,
            { $inc: { inventory: item.qty } }
        );
    }

    order.inventoryRestored = true;
    await order.save();

};
