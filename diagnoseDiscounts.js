// Direct MongoDB command to check and fix discounts
import mongoose from 'mongoose';
import Discount from './models/Discount.js';
import dotenv from 'dotenv';

dotenv.config();

async function diagnoseAndFix() {
    try {
        const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/velvet-tails';
        console.log('Connecting to:', uri);

        await mongoose.connect(uri);
        console.log('✅ Connected\n');

        // First, check what's in the database
        const all = await Discount.find({});
        console.log(`Total discounts in DB: ${all.length}\n`);

        if (all.length === 0) {
            console.log('❌ NO DISCOUNTS FOUND IN DATABASE!');
            console.log('You need to create discounts first via the admin panel.');
            await mongoose.disconnect();
            return;
        }

        // Show current state
        console.log('Current state:');
        const now = new Date();
        all.forEach((d, i) => {
            const expired = new Date(d.expiresAt) < now;
            console.log(`${i + 1}. ${d.code}`);
            console.log(`   active: ${d.active}`);
            console.log(`   expiresAt: ${d.expiresAt}`);
            console.log(`   expired: ${expired}`);
            console.log(`   status: ${d.active && !expired ? '✅ WILL SHOW' : '❌ HIDDEN'}\n`);
        });

        // Fix them
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);

        console.log(`\nUpdating all discounts...`);
        console.log(`Setting active=true, expiresAt=${futureDate.toISOString()}\n`);

        const result = await Discount.updateMany(
            {},
            {
                $set: {
                    active: true,
                    expiresAt: futureDate
                }
            }
        );

        console.log(`✅ Updated ${result.modifiedCount} discounts\n`);

        // Verify
        const active = await Discount.find({
            active: true,
            expiresAt: { $gt: now }
        });

        console.log(`Active discounts now: ${active.length}`);
        active.forEach(d => {
            console.log(`  - ${d.code}: ${d.type === 'percentage' ? d.value + '%' : '₹' + d.value} OFF`);
        });

        await mongoose.disconnect();
        console.log('\n✅ Done! Now test: curl http://localhost:5000/api/discounts');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    }
}

diagnoseAndFix();
