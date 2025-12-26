// Fix discounts - use correct field name "endsAt"
import mongoose from 'mongoose';
import Discount from './models/Discount.js';
import dotenv from 'dotenv';

dotenv.config();

async function fixDiscountsCorrectly() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/velvet-tails');
        console.log('✅ Connected to MongoDB\n');

        // Update ALL discounts to be active and have future endsAt date
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);

        const result = await Discount.updateMany(
            {},
            {
                $set: {
                    active: true,
                    endsAt: futureDate  // Correct field name!
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} discounts`);
        console.log(`   - Set active: true`);
        console.log(`   - Set endsAt: ${futureDate.toISOString()}\n`);

        // Verify
        const now = new Date();
        const active = await Discount.find({
            active: true,
            endsAt: { $gt: now }
        });

        console.log(`📋 Active discounts now: ${active.length}`);
        active.forEach(d => {
            console.log(`   ${d.code}: ${d.type === 'percentage' ? d.value + '%' : '₹' + d.value} OFF`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Done! Test with: curl http://localhost:5000/api/discounts');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

fixDiscountsCorrectly();
