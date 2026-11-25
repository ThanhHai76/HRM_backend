const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    decision: { type: String, enum: ["shortlist", "hold", "reject"], required: true },
    note: { type: String, required: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Kết quả AI chỉ mang tính GỢI Ý. Quyết định luôn do người ghi trong `reviews`.
const matchResultSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "HRM", required: true, index: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Jobs", required: true, index: true },
  ruleScore: Number,
  semanticScore: Number,
  suggestedScore: Number,
  breakdown: mongoose.Schema.Types.Mixed,
  assessment: mongoose.Schema.Types.Mixed,
  confidence: String,
  advisoryOnly: { type: Boolean, default: true },
  // Audit: để tái lập và kiểm tra kết quả
  audit: {
    model: String,
    promptVersion: String,
    inputHash: String,
    usage: mongoose.Schema.Types.Mixed,
  },
  reviews: [reviewSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

matchResultSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model("MatchResult", matchResultSchema);
