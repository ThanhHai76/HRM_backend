const mongoose = require("mongoose");

// File CV lưu trong MongoDB (đĩa của Heroku/Render không bền vững), tách theo công ty.
const cvFileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  contentType: { type: String, default: "application/pdf" },
  size: Number,
  data: { type: Buffer, required: true, select: false },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "HRM", index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  // File chưa gắn vào ứng viên sẽ tự xóa sau 24h (TTL). Gắn ứng viên thì bỏ trường này.
  expiresAt: { type: Date, index: { expireAfterSeconds: 0 } },
});

cvFileSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model("CvFile", cvFileSchema);
