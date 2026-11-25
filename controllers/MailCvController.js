const MailboxConfig = require("../models/MailboxConfig");
const SheetSync = require("../models/SheetSync");
const secretBox = require("../utils/secretBox");
const ingest = require("../services/mailIngestService");
const mailCv = require("../services/mailCvService");

const STALE_LOCK_MS = 15 * 60 * 1000;

const bad = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err) => {
  const status = err.status && Number.isInteger(err.status) && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? "Lỗi xử lý hộp thư: " + err.message : err.message });
};

const publicConfig = (c) =>
  c && {
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    hasPassword: true, // không bao giờ trả mật khẩu về client
    folder: c.folder,
    subjectKeywords: c.subjectKeywords || [],
    sinceDays: c.sinceDays,
    enabled: c.enabled,
    intervalMinutes: c.intervalMinutes,
    appendToSheet: c.appendToSheet,
    autoApprove: !!c.autoApprove,
    lastRunAt: c.lastRunAt,
    running: !!(c.runningSince && Date.now() - new Date(c.runningSince).getTime() < STALE_LOCK_MS),
    history: c.history || [],
  };

// GET /api/mail-cv/config
exports.getConfig = async (req, res) => {
  try {
    const config = await MailboxConfig.findOne();
    const sheet = await SheetSync.findOne();
    res.json({
      status: "success",
      data: {
        encryptionConfigured: secretBox.isConfigured(),
        aiConfigured: !!process.env.ANTHROPIC_API_KEY,
        sheetLinked: !!(sheet && sheet.verifiedAt),
        pendingCount: await mailCv.pendingCount(),
        config: publicConfig(config),
      },
    });
  } catch (err) {
    fail(res, err);
  }
};

const cleanKeywords = (list) =>
  (Array.isArray(list) ? list : String(list || "").split(","))
    .map((k) => String(k).trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((k) => k.slice(0, 60));

// PUT /api/mail-cv/config  (admin)
exports.saveConfig = async (req, res) => {
  try {
    const b = req.body || {};
    const host = String(b.host || "").trim();
    const user = String(b.user || "").trim();
    if (!host) throw bad(422, "Cần nhập máy chủ IMAP (ví dụ imap.gmail.com)");
    if (!user || user.length > 200) throw bad(422, "Cần nhập email của hộp thư");
    const port = Number(b.port) || 993;
    const folder = String(b.folder || "INBOX").trim().slice(0, 100) || "INBOX";

    let config = await MailboxConfig.findOne().select("+passwordEnc");
    const password = typeof b.password === "string" && b.password ? b.password : null;
    if (!config && !password) throw bad(422, "Cần nhập mật khẩu ứng dụng của hộp thư");

    const connectionChanged =
      !config || config.host !== host || config.port !== port || config.user !== user || config.folder !== folder || config.secure !== (b.secure !== false) || !!password;

    // Kiểm tra kết nối thật trước khi lưu: cấu hình sai không được lưu
    if (connectionChanged) {
      const plain = password || secretBox.decrypt(config.passwordEnc);
      await ingest.testConnection({ host, port, secure: b.secure !== false, user, password: plain, folder });
    }

    if (!config) config = new MailboxConfig({ host, user, passwordEnc: "-" });
    config.host = host;
    config.port = port;
    config.secure = b.secure !== false;
    config.user = user;
    config.folder = folder;
    if (password) config.passwordEnc = secretBox.encrypt(password);
    if (connectionChanged) {
      config.lastUid = 0; // hộp thư/thư mục khác: quét lại từ đầu (đã có chống trùng)
      config.uidValidity = undefined;
    }
    config.subjectKeywords = cleanKeywords(b.subjectKeywords);
    config.sinceDays = Math.min(90, Math.max(1, Number(b.sinceDays) || 14));
    config.intervalMinutes = Math.min(1440, Math.max(5, Number(b.intervalMinutes) || 10));
    config.appendToSheet = b.appendToSheet !== false;
    config.autoApprove = !!b.autoApprove;
    config.enabled = !!b.enabled;
    await config.save();
    res.json({ status: "success", data: publicConfig(config) });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/mail-cv/config/test  (admin) — thử lại kết nối với cấu hình đã lưu
exports.test = async (req, res) => {
  try {
    const config = await MailboxConfig.findOne().select("+passwordEnc");
    if (!config) throw bad(404, "Chưa cấu hình hộp thư");
    const result = await ingest.testConnection({
      host: config.host, port: config.port, secure: config.secure, user: config.user,
      password: secretBox.decrypt(config.passwordEnc), folder: config.folder,
    });
    res.json({ status: "success", data: result });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/mail-cv/run  — quét ngay
exports.run = async (req, res) => {
  try {
    const config = await MailboxConfig.findOne();
    if (!config) throw bad(404, "Chưa cấu hình hộp thư");
    const locked = await MailboxConfig.findOneAndUpdate(
      { _id: config._id, $or: [{ runningSince: null }, { runningSince: { $lt: new Date(Date.now() - STALE_LOCK_MS) } }] },
      { $set: { runningSince: new Date() } }
    );
    if (!locked) throw bad(409, "Đang có một lần quét khác chạy, vui lòng thử lại sau");
    res.json({ status: "success", data: await ingest.run(config, "manual") });
  } catch (err) {
    fail(res, err);
  }
};

// DELETE /api/mail-cv/config  (admin) — xóa cấu hình và mật khẩu; hàng chờ và ứng viên được giữ nguyên
exports.disconnect = async (req, res) => {
  try {
    await MailboxConfig.deleteOne();
    res.json({ status: "success" });
  } catch (err) {
    fail(res, err);
  }
};

exports.list = async (req, res) => {
  try {
    res.json({ status: "success", data: await mailCv.list(req.query.status || "pending") });
  } catch (err) {
    fail(res, err);
  }
};

exports.approve = async (req, res) => {
  try {
    res.json({ status: "success", data: await mailCv.approve(req.params.id, req.body, req.user._id) });
  } catch (err) {
    fail(res, err);
  }
};

exports.reject = async (req, res) => {
  try {
    res.json({ status: "success", data: await mailCv.reject(req.params.id, req.user._id) });
  } catch (err) {
    fail(res, err);
  }
};

exports.retrySheet = async (req, res) => {
  try {
    res.json({ status: "success", data: await mailCv.retrySheet(req.params.id) });
  } catch (err) {
    fail(res, err);
  }
};
