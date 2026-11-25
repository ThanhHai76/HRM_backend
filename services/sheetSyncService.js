const mongoose = require("mongoose");
const HRMModel = require("../models/HRM");
const SheetSync = require("../models/SheetSync");
const sheets = require("./googleSheetsService");
const { FIELDS, mapRow, resolveHeader } = require("../utils/employeeColumns");
const { getTenant } = require("../utils/tenantContext");

const KEY_HEADER = "SĐT";

// 0901 234 567 / +84901234567 / 84901234567 -> 0901234567
const normPhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) digits = "0" + digits.slice(2);
  return digits.length >= 8 ? digits : "";
};
const normEmail = (value) => String(value || "").trim().toLowerCase();

const keysOf = (record) => {
  const keys = [];
  const phone = normPhone(record.phone);
  const email = normEmail(record.email);
  if (phone) keys.push(`p:${phone}`);
  if (email && /^[^\s@]+@[^\s@]+$/.test(email)) keys.push(`e:${email}`);
  return keys;
};

// values: mảng dòng của Sheet (dòng đầu là tiêu đề). Trả về { headers, rows:[{tiêu đề: giá trị}] }
const toRows = (values) => {
  if (!values || !values.length) return { headers: [], rows: [] };
  const seen = {};
  const headers = (values[0] || []).map((h) => {
    const name = String(h || "").trim();
    if (!name) return "";
    const n = seen[name] || 0;
    seen[name] = n + 1;
    return n === 0 ? name : `${name}_${n}`; // tiêu đề trùng tên được đánh hậu tố, giống nhập Excel
  });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = {};
    let has = false;
    headers.forEach((h, c) => {
      if (!h) return;
      const v = values[i][c];
      if (v != null && String(v).trim() !== "") {
        row[h] = String(v);
        has = true;
      }
    });
    if (has) rows.push(row);
  }
  return { headers, rows };
};

const same = (a, b) => String(a == null ? "" : a).trim() === String(b == null ? "" : b).trim();

/**
 * Tính kế hoạch đồng bộ (KHÔNG ghi gì).
 * Quy tắc: Sheet là nguồn chính. Ô trống trên Sheet KHÔNG xóa dữ liệu đang có.
 * Ứng viên được nhận diện theo SĐT (chuẩn hóa), nếu không có thì theo email.
 */
async function buildPlan(values) {
  const { headers, rows } = toRows(values);
  const recognized = headers.filter((h) => h && resolveHeader(h));
  const unrecognized = headers.filter((h) => h && !resolveHeader(h));

  const stats = { sheetRows: rows.length, skippedNoKey: 0, duplicatesInSheet: 0, toAdd: 0, toUpdate: 0, unchanged: 0, conflicts: 0 };

  // Gộp dòng trùng khóa trong Sheet (dòng sau thắng)
  const byKey = new Map();
  for (const row of rows) {
    const rec = mapRow(row);
    const keys = keysOf(rec);
    if (!keys.length) {
      stats.skippedNoKey++;
      continue;
    }
    const primary = keys[0];
    if (byKey.has(primary)) stats.duplicatesInSheet++;
    byKey.set(primary, { rec, keys });
  }

  // Ứng viên hiện có của công ty (plugin tự giới hạn theo công ty)
  const existing = await HRMModel.find().select([...FIELDS, "sheetSnapshot"].join(" "));
  const index = new Map();
  for (const doc of existing) {
    for (const k of keysOf(doc)) if (!index.has(k)) index.set(k, doc);
  }

  const inserts = [];
  const updates = [];
  const matchedDocs = new Set();

  for (const { rec, keys } of byKey.values()) {
    const doc = keys.map((k) => index.get(k)).find(Boolean);
    if (!doc) {
      inserts.push(rec);
      stats.toAdd++;
      continue;
    }
    if (matchedDocs.has(String(doc._id))) {
      stats.duplicatesInSheet++;
      continue;
    }
    matchedDocs.add(String(doc._id));

    const changes = {};
    let conflict = false;
    const snapshot = doc.sheetSnapshot || null;
    for (const field of Object.keys(rec)) {
      if (same(doc[field], rec[field])) continue;
      changes[field] = rec[field];
      // Giá trị trên web đã bị sửa tay khác với lần đồng bộ trước -> sắp bị Sheet ghi đè
      if (snapshot && doc[field] != null && String(doc[field]).trim() !== "" && !same(doc[field], snapshot[field])) conflict = true;
    }
    if (!Object.keys(changes).length) {
      stats.unchanged++;
      continue;
    }
    if (conflict) stats.conflicts++;
    updates.push({ id: doc._id, changes, snapshot: { ...(snapshot || {}), ...rec } });
    stats.toUpdate++;
  }

  return { headers, recognized, unrecognized, stats, inserts, updates };
}

// Đọc Sheet theo cấu hình rồi tính kế hoạch (dùng cho xem trước và chạy thật)
async function planFor(config) {
  const values = await sheets.readSheet(config.spreadsheetId, config.sheetName);
  return buildPlan(values);
}

exports.preview = async (config) => {
  const plan = await planFor(config);
  return { headers: plan.headers, recognized: plan.recognized, unrecognized: plan.unrecognized, stats: plan.stats, hasKeyColumn: plan.headers.some((h) => ["phone", "email"].includes(resolveHeader(h))) };
};

exports.run = async (config, trigger = "manual") => {
  const tenant = getTenant();
  if (!tenant || !tenant.companyId) throw new Error("Tenant context missing");
  const companyId = new mongoose.Types.ObjectId(String(tenant.companyId));
  const started = Date.now();
  let entry;

  try {
    const plan = await planFor(config);
    if (!plan.recognized.length) {
      throw Object.assign(new Error("Không nhận diện được cột nào. Dòng đầu tiên của tab phải là tiêu đề (ví dụ: Họ và tên, SĐT, Địa chỉ mail)."), { status: 422 });
    }
    if (!plan.headers.some((h) => ["phone", "email"].includes(resolveHeader(h)))) {
      throw Object.assign(new Error("Cần có cột SĐT hoặc Địa chỉ mail để nhận diện ứng viên."), { status: 422 });
    }

    const now = new Date();
    const stats = { ...plan.stats, added: 0, updated: 0, errors: 0 };

    // Thêm mới (plugin gắn companyId). unordered: một dòng lỗi không làm hỏng cả lô
    if (plan.inserts.length) {
      const docs = plan.inserts.map((rec) => ({ ...rec, sheetSnapshot: rec, sheetSyncedAt: now }));
      for (let i = 0; i < docs.length; i += 500) {
        const chunk = docs.slice(i, i + 500);
        try {
          const res = await HRMModel.insertMany(chunk, { ordered: false });
          stats.added += res.length;
        } catch (err) {
          const inserted = (err.insertedDocs && err.insertedDocs.length) || 0;
          stats.added += inserted;
          stats.errors += chunk.length - inserted;
        }
      }
    }

    // Cập nhật bằng bulkWrite: bulkWrite không đi qua hook của plugin nên PHẢI lọc companyId tường minh
    if (plan.updates.length) {
      for (let i = 0; i < plan.updates.length; i += 500) {
        const ops = plan.updates.slice(i, i + 500).map((u) => ({
          updateOne: {
            filter: { _id: u.id, companyId },
            update: { $set: { ...u.changes, sheetSnapshot: u.snapshot, sheetSyncedAt: now } },
          },
        }));
        const res = await HRMModel.bulkWrite(ops, { ordered: false });
        stats.updated += (res.modifiedCount != null ? res.modifiedCount : res.nModified) || 0;
      }
    }

    entry = { at: now, trigger, ok: true, stats, durationMs: Date.now() - started };
  } catch (err) {
    entry = { at: new Date(), trigger, ok: false, error: err.message, durationMs: Date.now() - started };
    await record(config, entry);
    throw err;
  }
  await record(config, entry);
  return entry;
};

// Lưu lịch sử (giữ 20 lần gần nhất)
async function record(config, entry) {
  await SheetSync.updateOne(
    { _id: config._id },
    { $set: { lastRunAt: entry.at, runningSince: null }, $push: { history: { $each: [entry], $position: 0, $slice: 20 } } }
  );
}

exports.normPhone = normPhone;
exports.normEmail = normEmail;
exports.keysOf = keysOf;
exports.toRows = toRows;
exports.buildPlan = buildPlan;
exports.KEY_HEADER = KEY_HEADER;
