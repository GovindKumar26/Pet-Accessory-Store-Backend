// Fix all discounts - make them active and extend expiry
import mongoose from 'mongoose';
import Discount from './models/Discount.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixDiscounts() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/velvet-tails');
        console.log('Connected to MongoDB');

        // Update ALL discounts to be active and expire 30 days from now
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);

        const result = await Discount.updateMany(
            {},
            {
                $set: {
                    active: true,
                    expiresAt: futureDate
                }
            }
        );

        console.log(`\n✅ Updated ${result.modifiedCount} discounts`);
        console.log(`   - Set active: true`);
        console.log(`   - Set expiresAt: ${futureDate.toISOString()}`);

        // Show updated discounts
        const updated = await Discount.find({ active: true });
        console.log(`\n📋 Active discounts now:`);
        updated.forEach(d => {
            console.log(`   ${d.code}: ${d.type === 'percentage' ? d.value + '%' : '₹' + d.value} OFF`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Done! Refresh your page to see discounts.');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

fixDiscounts();
