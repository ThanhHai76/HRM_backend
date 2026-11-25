const mongoose = require("mongoose");
const MailCv = require("../models/MailCv");
const MailboxConfig = require("../models/MailboxConfig");
const SheetSync = require("../models/SheetSync");
const CvFile = require("../models/CvFile");
const HRMModel = require("../models/HRM");
const sheets = require("./googleSheetsService");
const { keysOf, toRows } = require("./sheetSyncService");
const { mapRow, resolveHeader } = require("../utils/employeeColumns");

const httpError = (status, message) => Object.assign(new Error(message), { status });

const PREFILL_FIELDS = ["name", "phone", "email", "birthYear", "academicLevel", "specialized", "companyUV"];

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

async function findExistingEmployee(prefill) {
  const mine = new Set(keysOf(prefill));
  if (!mine.size) return null;
  const docs = await HRMModel.find().select([...PREFILL_FIELDS, "job"].join(" "));
  return docs.find((d) => keysOf(d).some((k) => mine.has(k))) || null;
}

/** Ghi thêm một dòng vào Google Sheet đã liên kết (nếu bật và Sheet chưa có ứng viên này). Lỗi không làm hỏng việc duyệt. */
async function appendToSheet(employee) {
  const mailbox = await MailboxConfig.findOne();
  if (!mailbox || !mailbox.appendToSheet) return { skipped: "disabled" };
  const link = await SheetSync.findOne();
  if (!link || !link.verifiedAt) return { skipped: "no_sheet" };
  try {
    const { headers, rows } = toRows(await sheets.readSheet(link.spreadsheetId, link.sheetName));
    if (!headers.some(Boolean)) return { skipped: "no_header" };

    // Sheet đã có dòng cùng SĐT/email -> không ghi trùng
    const mine = new Set(keysOf(employee));
    if (rows.some((row) => keysOf(mapRow(row)).some((k) => mine.has(k)))) return { skipped: "exists" };

    const row = headers.map((h) => {
      const field = h ? resolveHeader(h) : null;
      const value = field ? employee[field] : "";
      return value == null ? "" : String(value);
    });
    await sheets.appendRow(link.spreadsheetId, link.sheetName, row);
    return { appended: true };
  } catch (err) {
    return { error: err.message };
  }
}

const summarize = (item, duplicateName) => ({
  _id: item._id,
  status: item.status,
  from: item.from,
  fromName: item.fromName,
  subject: item.subject,
  receivedAt: item.receivedAt,
  attachmentName: item.attachmentName,
  cvFileId: item.cvFileId,
  prefill: item.prefill || {},
  headline: item.profile && item.profile.headline,
  skills: ((item.profile && item.profile.skills) || []).slice(0, 12),
  totalYearsExperience: item.profile && item.profile.totalYearsExperience,
  parseError: item.parseError,
  flags: item.flags || [],
  duplicateOf: item.duplicateOfEmployeeId ? { _id: item.duplicateOfEmployeeId, name: duplicateName || "" } : null,
  employeeId: item.employeeId,
  autoApproved: !!item.autoApproved,
  sheet: item.sheet,
  reviewedAt: item.reviewedAt,
  createdAt: item.createdAt,
});

exports.list = async (status = "pending") => {
  if (!["pending", "approved", "rejected"].includes(status)) throw httpError(422, "status không hợp lệ");
  const items = await MailCv.find({ status }).sort({ receivedAt: -1, createdAt: -1 }).limit(200);
  const dupIds = items.map((i) => i.duplicateOfEmployeeId).filter(Boolean);
  const dups = dupIds.length ? await HRMModel.find({ _id: { $in: dupIds } }).select("name") : [];
  const names = new Map(dups.map((d) => [String(d._id), d.name]));
  return items.map((i) => summarize(i, i.duplicateOfEmployeeId && names.get(String(i.duplicateOfEmployeeId))));
};

exports.pendingCount = () => MailCv.countDocuments({ status: "pending" });

/**
 * Duyệt: tạo ứng viên mới (nguồn "Email") hoặc bổ sung ứng viên đã có (chỉ điền ô còn trống, không ghi đè dữ liệu
 * nhân sự đã nhập), lưu file CV + hồ sơ năng lực, rồi ghi thêm một dòng vào Google Sheet.
 */
exports.approve = async (id, edits = {}, userId) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid id");
  const item = await MailCv.findById(id);
  if (!item) throw httpError(404, "Không tìm thấy CV trong hàng chờ");
  if (item.status !== "pending") throw httpError(409, "CV này đã được xử lý");

  const prefill = { ...(item.prefill || {}) };
  const incoming = edits.prefill && typeof edits.prefill === "object" ? edits.prefill : {};
  for (const f of PREFILL_FIELDS) {
    if (typeof incoming[f] === "string") prefill[f] = incoming[f].trim().slice(0, 500);
  }
  if (!String(prefill.name || "").trim()) throw httpError(422, "Cần có họ tên ứng viên");
  if (!keysOf(prefill).length) throw httpError(422, "Cần có SĐT hoặc email hợp lệ để nhận diện ứng viên");
  const job = typeof edits.job === "string" ? edits.job.trim().slice(0, 200) : "";

  const existing = await findExistingEmployee(prefill);
  let employee;
  if (existing) {
    const set = {};
    for (const f of PREFILL_FIELDS) if (!existing[f] && prefill[f]) set[f] = prefill[f];
    if (job && !existing.job) set.job = job;
    if (item.profile) set.cvProfile = item.profile;
    set.cvFileId = item.cvFileId;
    employee = await HRMModel.findByIdAndUpdate(existing._id, set, { new: true });
  } else {
    const data = { source: "Email", cvDate: today(), job, cvFileId: item.cvFileId };
    for (const f of PREFILL_FIELDS) if (prefill[f]) data[f] = prefill[f];
    if (item.profile) data.cvProfile = item.profile;
    employee = await HRMModel.create(data);
  }

  const file = item.cvFileId && (await CvFile.findById(item.cvFileId));
  if (file) {
    file.employeeId = employee._id;
    file.expiresAt = undefined; // đã gắn ứng viên -> không tự xóa
    await file.save();
  }

  item.status = "approved";
  item.employeeId = employee._id;
  item.reviewedBy = userId;
  item.reviewedAt = new Date();
  item.autoApproved = !userId;
  item.prefill = prefill;
  item.sheet = await appendToSheet(employee);
  await item.save();
  return { item: summarize(item), employeeId: employee._id, updatedExisting: !!existing };
};

/** Bỏ qua: xóa file CV và dữ liệu cá nhân đã trích xuất, chỉ giữ dấu vết (người gửi, tiêu đề, thời gian). */
exports.reject = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid id");
  const item = await MailCv.findById(id);
  if (!item) throw httpError(404, "Không tìm thấy CV trong hàng chờ");
  if (item.status !== "pending") throw httpError(409, "CV này đã được xử lý");
  if (item.cvFileId) await CvFile.findByIdAndDelete(item.cvFileId);
  item.status = "rejected";
  item.cvFileId = undefined;
  item.prefill = undefined;
  item.profile = undefined;
  item.reviewedBy = userId;
  item.reviewedAt = new Date();
  await item.save();
  return summarize(item);
};

exports.retrySheet = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "Invalid id");
  const item = await MailCv.findById(id);
  if (!item || item.status !== "approved" || !item.employeeId) throw httpError(404, "Không có mục để ghi lại");
  const employee = await HRMModel.findById(item.employeeId);
  if (!employee) throw httpError(404, "Ứng viên không còn tồn tại");
  item.sheet = await appendToSheet(employee);
  await item.save();
  return summarize(item);
};
