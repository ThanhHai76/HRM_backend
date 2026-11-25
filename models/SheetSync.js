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

// Cấu hình đồng bộ Google Sheet -> ứng viên của MỘT công ty (mỗi công ty một cấu hình).
const sheetSyncSchema = new mongoose.Schema({
  spreadsheetId: { type: String, required: true },
  sheetName: { type: String, required: true },
  enabled: { type: Boolean, default: false },
  intervalMinutes: { type: Number, default: 15, min: 5, max: 1440 },

  // Chứng minh quyền sở hữu: Sheet phải có tab "HRM_SYNC" với ô A1 = verifyCode,
  // để công ty khác không thể đọc Sheet của người khác chỉ vì biết ID.
  verifyCode: String,
  verifiedAt: Date,

  lastRunAt: Date,
  runningSince: Date, // khóa chống chạy trùng giữa nhiều instance
  history: [runSchema],
  createdAt: { type: Date, default: Date.now },
});

sheetSyncSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model("SheetSync", sheetSyncSchema);
