const mongoose = require("mongoose");

const runSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    trigger: { type: String, enum: ["manual", "schedule"], default: "manual" },
    ok: Boolean,
    error: String,
    stats: mongoose.Schema.Types.Mixed,
    durationMs: Number,
  },
  { _id: false }
);

// Cấu hình hộp thư nhận CV của MỘT công ty. Chỉ ĐỌC hộp thư (IMAP readOnly), không đổi/xóa/đánh dấu thư.
const mailboxConfigSchema = new mongoose.Schema({
  host: { type: String, required: true },
  port: { type: Number, default: 993 },
  secure: { type: Boolean, default: true },
  user: { type: String, required: true },
  passwordEnc: { type: String, required: true, select: false }, // AES-256-GCM, không bao giờ trả về client
  folder: { type: String, default: "INBOX" },
  subjectKeywords: [String], // để trống = nhận mọi email có file PDF đính kèm
  sinceDays: { type: Number, default: 14, min: 1, max: 90 }, // lần chạy đầu chỉ quét email trong N ngày gần nhất
  enabled: { type: Boolean, default: false },
  intervalMinutes: { type: Number, default: 10, min: 5, max: 1440 },
  appendToSheet: { type: Boolean, default: true }, // khi duyệt, ghi thêm dòng vào Google Sheet đã liên kết
  // Tự nhập CV hợp lệ (đọc được chữ, có họ tên + SĐT/email, chưa có trong hệ thống) mà không cần duyệt tay.
  // CV scan, thiếu liên hệ hoặc trùng ứng viên cũ vẫn vào hàng chờ để người quyết định.
  autoApprove: { type: Boolean, default: false },

  uidValidity: Number,
  lastUid: { type: Number, default: 0 },
  lastRunAt: Date,
  runningSince: Date,
  history: [runSchema],
  createdAt: { type: Date, default: Date.now },
});

mailboxConfigSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model("MailboxConfig", mailboxConfigSchema);
