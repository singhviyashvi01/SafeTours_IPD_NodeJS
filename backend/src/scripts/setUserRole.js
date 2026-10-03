/**
 * setUserRole.js — promote or demote a user.
 *   node src/scripts/setUserRole.js <email> <user|admin>
 * (npm run user:role -- <email> admin)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const mongoose = require('mongoose');
const User = require('../models/User');

const [email, role] = process.argv.slice(2);
if (!email || !['user', 'admin'].includes(role)) {
  console.error('Usage: node src/scripts/setUserRole.js <email> <user|admin>');
  process.exit(1);
}

(async () => {
  mongoose.set('autoIndex', false);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const res = await User.updateOne({ email: email.toLowerCase() }, { $set: { role } });
  if (res.matchedCount === 0) {
    console.error(`No user with email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`${email} is now "${role}".`);
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
