const mongoose = require("mongoose");
const Schema = mongoose.Schema;
 
const hrmSchema = new Schema({
  source: String,
  cvDate: String,
  job: String,
  name: String,
  birthYear: String,
  academicLevel: String,
  specialized: String,
  phone: String,
  email: String,
  linkCV: String,
  linkSP: String,
  linkFB: String,
  companyUV: String,
  hrSuggest: String,
  hrMark: String,
  partMark: String,
  round1: String,
  joinRound1: String,
  interviewV1: String,
  round2: String,
  joinRound2: String,
  interviewV2: String,
  notes: String,
  offer: String,
  offerResult: String,
  notes2: String,
  goWork: String,
  onboardDate: String,
  probationTime: String,
  probationResult: String,
  notes3: String,
  // Hồ sơ năng lực có cấu trúc do AI trích xuất từ CV (không chứa thông tin định danh)
  cvProfile: Schema.Types.Mixed,
  // File CV gốc đã lưu trong hệ thống (xem collection cvfiles)
  cvFileId: Schema.Types.ObjectId,
  // Đồng bộ từ Google Sheet: giá trị lần đồng bộ gần nhất (để phát hiện chỉnh sửa tay trên web) và thời điểm
  sheetSnapshot: Schema.Types.Mixed,
  sheetSyncedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

hrmSchema.plugin(require("../utils/tenantPlugin"));

const HRMModel = mongoose.model("HRM", hrmSchema);
 
module.exports = HRMModel;