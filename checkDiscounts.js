// Script to check and fix discount status
// Run with: node checkDiscounts.js

import mongoose from 'mongoose';
import Discount from './models/Discount.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/velvet-tails';

async function checkDiscounts() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get ALL discounts
        const allDiscounts = await Discount.find().sort({ createdAt: -1 });
        console.log(`📊 Total discounts in database: ${allDiscounts.length}\n`);

        if (allDiscounts.length === 0) {
            console.log('❌ No discounts found in database!');
            await mongoose.disconnect();
            return;
        }

        const now = new Date();

        console.log('📋 Discount Status:\n');
        allDiscounts.forEach((d, index) => {
            const isExpired = new Date(d.expiresAt) < now;
            const status = d.active && !isExpired ? '✅ ACTIVE' : '❌ INACTIVE';

            console.log(`${index + 1}. ${d.code}`);
            console.log(`   Status: ${status}`);
            console.log(`   Active flag: ${d.active}`);
            console.log(`   Expires: ${d.expiresAt}`);
            console.log(`   Expired: ${isExpired ? 'YES' : 'NO'}`);
            console.log(`   Type: ${d.type} - ${d.value}${d.type === 'percentage' ? '%' : '₹'}`);
            console.log('');
        });

        // Count active vs inactive
        const activeCount = allDiscounts.filter(d => d.active && new Date(d.expiresAt) > now).length;
        const inactiveCount = allDiscounts.length - activeCount;

        console.log(`\n📈 Summary:`);
        console.log(`   Active & Not Expired: ${activeCount}`);
        console.log(`   Inactive or Expired: ${inactiveCount}`);

        if (activeCount === 0) {
            console.log('\n⚠️  No active discounts found!');
            console.log('💡 To fix: Update discounts to be active and have future expiry dates');
            console.log('\nExample fix command:');
            console.log('   db.discounts.updateMany({}, { $set: { active: true, expiresAt: new Date("2025-12-31") } })');
        }

        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkDiscounts();
