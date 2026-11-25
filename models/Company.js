const mongoose = require("mongoose");

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 255 },
  // Chuẩn bị cho gói thuê bao theo tháng / vị trí (chưa áp dụng hạn mức)
  plan: { type: String, default: "free" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Company", companySchema);
