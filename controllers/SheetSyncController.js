const crypto = require("crypto");
const SheetSync = require("../models/SheetSync");
const sheets = require("../services/googleSheetsService");
const sync = require("../services/sheetSyncService");

const STALE_LOCK_MS = 10 * 60 * 1000;

const fail = (res, err) => {
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? "Lỗi đồng bộ: " + err.message : err.message });
};
const bad = (status, message) => Object.assign(new Error(message), { status });

const publicConfig = (c) =>
  c && {
    spreadsheetId: c.spreadsheetId,
    sheetName: c.sheetName,
    enabled: c.enabled,
    intervalMinutes: c.intervalMinutes,
    verifyCode: c.verifiedAt ? undefined : c.verifyCode, // đã xác minh thì không cần hiện lại
    verified: !!c.verifiedAt,
    lastRunAt: c.lastRunAt,
    running: !!(c.runningSince && Date.now() - new Date(c.runningSince).getTime() < STALE_LOCK_MS),
    history: c.history || [],
  };

const requireVerified = async () => {
  const config = await SheetSync.findOne();
  if (!config) throw bad(404, "Chưa cấu hình Google Sheet");
  if (!config.verifiedAt) throw bad(409, "Chưa xác minh quyền sở hữu Sheet");
  return config;
};

// GET /api/sync/sheets
exports.getConfig = async (req, res) => {
  try {
    const config = await SheetSync.findOne();
    res.json({
      status: "success",
      data: {
        serverConfigured: sheets.isConfigured(),
        serviceAccountEmail: sheets.getServiceAccountEmail(),
        config: publicConfig(config),
      },
    });
  } catch (err) {
    fail(res, err);
  }
};

// PUT /api/sync/sheets  { spreadsheet, sheetName, enabled, intervalMinutes }  (admin)
exports.saveConfig = async (req, res) => {
  try {
    const { spreadsheet, sheetName, enabled, intervalMinutes } = req.body || {};
    const spreadsheetId = sheets.parseSpreadsheetId(spreadsheet);
    if (!spreadsheetId) throw bad(422, "Link hoặc ID Google Sheet không hợp lệ");
    if (!sheetName || typeof sheetName !== "string" || !sheetName.trim() || sheetName.length > 100) {
      throw bad(422, "Cần nhập tên tab (sheet) chứa dữ liệu");
    }
    const interval = Math.min(1440, Math.max(5, Number(intervalMinutes) || 15));

    // Một Sheet chỉ được liên kết với một công ty
    const owner = await SheetSync.findOne({ spreadsheetId }).setOptions({ skipTenant: true });
    if (owner && String(owner.companyId) !== String(req.user.companyId)) {
      throw bad(409, "Google Sheet này đã được liên kết với một công ty khác");
    }

    let config = await SheetSync.findOne();
    if (!config) {
      config = new SheetSync({ spreadsheetId, sheetName: sheetName.trim() });
    }
    const changedSheet = config.spreadsheetId !== spreadsheetId;
    config.spreadsheetId = spreadsheetId;
    config.sheetName = sheetName.trim();
    config.intervalMinutes = interval;
    if (changedSheet || !config.verifyCode) {
      config.verifyCode = "hrm-" + crypto.randomBytes(8).toString("hex");
      config.verifiedAt = null;
    }
    config.enabled = !!enabled && !!config.verifiedAt; // chỉ bật khi đã xác minh
    await config.save();
    res.json({ status: "success", data: publicConfig(config) });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/sync/sheets/verify  (admin)
exports.verify = async (req, res) => {
  try {
    const config = await SheetSync.findOne();
    if (!config) throw bad(404, "Chưa cấu hình Google Sheet");
    await sheets.checkOwnership(config.spreadsheetId, config.verifyCode);
    config.verifiedAt = new Date();
    await config.save();
    res.json({ status: "success", data: publicConfig(config) });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/sync/sheets/preview  — chỉ đọc, không ghi dữ liệu
exports.preview = async (req, res) => {
  try {
    const config = await requireVerified();
    res.json({ status: "success", data: await sync.preview(config) });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/sync/sheets/run  — đồng bộ ngay
exports.run = async (req, res) => {
  try {
    const config = await requireVerified();
    // Khóa nguyên tử: không chạy trùng (kể cả giữa các instance)
    const locked = await SheetSync.findOneAndUpdate(
      { _id: config._id, $or: [{ runningSince: null }, { runningSince: { $lt: new Date(Date.now() - STALE_LOCK_MS) } }] },
      { $set: { runningSince: new Date() } }
    );
    if (!locked) throw bad(409, "Đang có một lần đồng bộ khác chạy, vui lòng thử lại sau");
    const entry = await sync.run(config, "manual");
    res.json({ status: "success", data: entry });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/sync/sheets  (admin) — ngắt kết nối; dữ liệu ứng viên đã đồng bộ được giữ nguyên
exports.disconnect = async (req, res) => {
  try {
    await SheetSync.deleteOne();
    res.json({ status: "success" });
  } catch (err) {
    fail(res, err);
  }
};
