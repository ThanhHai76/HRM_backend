const mongoose = require("mongoose");

// Một CV nhận từ email, đang chờ nhân sự duyệt. Chưa phải ứng viên cho tới khi được duyệt.
const mailCvSchema = new mongoose.Schema({
  messageId: String,
  from: String,
  fromName: String,
  subject: String,
  receivedAt: Date,
  attachmentName: String,
  attachmentHash: { type: String, required: true },
  cvFileId: { type: mongoose.Schema.Types.ObjectId, ref: "CvFile" },

  // Do AI trích xuất; nhân sự có thể sửa khi duyệt
  prefill: mongoose.Schema.Types.Mixed,
  profile: mongoose.Schema.Types.Mixed,
  parseError: String, // ví dụ PDF scan không đọc được: vẫn vào hàng chờ để xử lý thủ công
  flags: [String], // missing_contact | scanned | duplicate

  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
  duplicateOfEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "HRM" }, // đã có ứng viên cùng SĐT/email
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "HRM" },

  sheet: { appended: Boolean, skipped: String, error: String }, // kết quả ghi vào Google Sheet khi duyệt
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date,
  autoApproved: Boolean, // true = hệ thống tự nhập, không qua duyệt tay
  createdAt: { type: Date, default: Date.now },
});

mailCvSchema.index({ companyId: 1, attachmentHash: 1 }, { unique: true });
mailCvSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model("MailCv", mailCvSchema);
