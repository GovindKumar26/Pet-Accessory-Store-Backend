import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Product from '../models/Product.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import Discount from '../models/Discount.js';
import TaxConfig from '../models/TaxConfig.js';

const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/velvet-tails';

const products = [
  { title: 'Velvet Dog Collar', slug: 'velvet-dog-collar', description: 'Premium velvet collar', price: 799, images:['/images/collar1.jpg'], category:'collars', featured:true, inventory: 10 },
  { title: 'Silk Bow Tie', slug: 'silk-bow-tie', description: 'Elegant bow tie for pets', price: 499, images:['/images/bow1.jpg'], category:'accessories', featured:true, inventory: 25 },
  { title: 'Deluxe Pet Bed', slug: 'deluxe-pet-bed', description: 'Comfortable pet bed', price: 2499, images:['/images/bed1.jpg'], category:'beds', featured:false, inventory: 5 }
];

mongoose.connect(MONGO).then(async ()=>{
  console.log('Connected to mongo');
  await Product.deleteMany({});
  await Product.insertMany(products);
  console.log('Products seeded');
  const pw = await bcrypt.hash('password123',10);
  await User.deleteMany({});
  await User.create({ name:'Test User', email:'test@example.com', passwordHash: pw });
  // create admin
  await User.create({ name:'Admin User', email:'admin@example.com', passwordHash: pw, role: 'admin' });
  console.log('Users created: test@example.com / password123 and admin@example.com / password123');
  // seed discounts
  await Discount.deleteMany({});
  await Discount.insertMany([{ code:'WELCOME10', type:'percentage', value:10, active:true }, { code:'FLAT50', type:'fixed', value:50, active:true }]);
  console.log('Discounts seeded');
  // seed tax config
  await TaxConfig.deleteMany({});
  await TaxConfig.create({ name:'GST', rate:18, inclusive:false });
  console.log('Tax config seeded');
  process.exit(0);
}).catch(err=>{ console.error(err); process.exit(1); });
