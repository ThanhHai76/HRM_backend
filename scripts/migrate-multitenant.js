/**
 * Migration một lần: gán dữ liệu cũ (chưa có companyId) vào một công ty mặc định.
 *   node scripts/migrate-multitenant.js "Tên công ty"
 * An toàn khi chạy lại: chỉ cập nhật bản ghi chưa có companyId.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Company = require("../models/Company");
const User = require("../models/User");

const COLLECTIONS = ["hrms", "jobs", "trackings", "emailtemplates", "pdfs"];

(async () => {
  mongoose.set("strictQuery", false);
  await mongoose.connect(process.env.MONGODB_URI_SERVER);

  const name = process.argv[2] || "Default company";
  let company = await Company.findOne({ name });
  if (!company) company = await Company.create({ name });
  console.log("Company:", company._id.toString(), company.name);

  // Dùng native driver (collection) để bỏ qua tenant plugin
  const users = await User.find({ companyId: { $exists: false } }).sort({ _id: 1 });
  for (let i = 0; i < users.length; i++) {
    await User.updateOne(
      { _id: users[i]._id },
      { companyId: company._id, role: i === 0 ? "admin" : "hr" }
    );
  }
  console.log("Users migrated:", users.length);

  const db = mongoose.connection.db;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  for (const collection of existing.filter((n) => COLLECTIONS.includes(n.toLowerCase()))) {
    const res = await db
      .collection(collection)
      .updateMany({ companyId: { $exists: false } }, { $set: { companyId: company._id } });
    console.log(collection, "migrated:", res.modifiedCount);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
