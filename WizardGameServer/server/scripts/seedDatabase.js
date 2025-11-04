// اضافه کردن دیتای اولیه
const mongoose = require('mongoose');
require('dotenv').config();

async function seed() {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('✅ Seeding database...');
    
    // Add initial data here
    
    await mongoose.disconnect();
    console.log('✅ Done!');
}

seed().catch(console.error);