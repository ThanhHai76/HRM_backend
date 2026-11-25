const crypto = require("crypto");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const pdfParse = require("pdf-parse");

const MailboxConfig = require("../models/MailboxConfig");
const MailCv = require("../models/MailCv");
const CvFile = require("../models/CvFile");
const HRMModel = require("../models/HRM");
const ai = require("./aiService");
const hostGuard = require("../utils/hostGuard");
const secretBox = require("../utils/secretBox");
const { sanitizeProfile } = require("../utils/profile");
const { fold } = require("../utils/employeeColumns");
const { getTenant } = require("../utils/tenantContext");
const { keysOf } = require("./sheetSyncService");
const mailCv = require("./mailCvService");

const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDFS_PER_MESSAGE = 3;
const MAX_MESSAGES_PER_RUN = 100;
const MAX_AI_PER_RUN = 15; // chặn chi phí AI mỗi lần chạy; phần còn lại xử lý ở lần sau
const PENDING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CV_CHARS = 30000;

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Có thể thay thế khi kiểm thử
exports.createClient = (options) => new ImapFlow(options);
exports.guard = (host, port) => hostGuard.assertPublicHost(host, port);

const withTimeout = (promise, ms, message) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

async function openClient({ host, port, secure, user, password }) {
  const target = await exports.guard(host, port);
  return exports.createClient({
    host: target.address, // kết nối thẳng vào IP đã kiểm tra
    port: Number(port),
    secure: !!secure,
    servername: target.host,
    tls: { servername: target.host },
    auth: { user, pass: password },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
  });
}

const friendlyConnectError = (err) => {
  if (err.authenticationFailed) return httpError(422, "Sai email hoặc mật khẩu ứng dụng (hoặc IMAP chưa được bật trong hộp thư)");
  if (err.status) return err;
  return httpError(502, `Không kết nối được hộp thư: ${err.responseText || err.message}`);
};

/** Kiểm tra kết nối và thư mục. Không đọc nội dung thư. */
exports.testConnection = async ({ host, port, secure, user, password, folder }) => {
  let client;
  try {
    client = await openClient({ host, port, secure, user, password });
    await client.connect();
    const lock = await client.getMailboxLock(folder || "INBOX", { readOnly: true });
    try {
      return { exists: Number(client.mailbox.exists) || 0, folder: folder || "INBOX" };
    } finally {
      lock.release();
    }
  } catch (err) {
    throw friendlyConnectError(err);
  } finally {
    if (client) await client.logout().catch(() => {});
  }
};

const isPdf = (att) => {
  if (!att || !att.content || !att.content.length) return false;
  const typeOk = String(att.contentType || "").toLowerCase() === "application/pdf" || /\.pdf$/i.test(att.filename || "");
  return typeOk && att.content.subarray(0, 5).toString("latin1") === "%PDF-"; // kiểm tra cả phần đầu file, không tin tên/đuôi
};

const matchesKeywords = (keywords, subject, filenames) => {
  if (!keywords || !keywords.length) return true;
  const haystack = fold(`${subject || ""} ${filenames.join(" ")}`);
  return keywords.some((k) => haystack.includes(fold(k)));
};

// Chỉ số ứng viên hiện có (khóa SĐT/email -> id), nạp một lần mỗi lần chạy
async function loadEmployeeIndex() {
  const index = new Map();
  const docs = await HRMModel.find().select("phone email");
  for (const doc of docs) for (const k of keysOf(doc)) if (!index.has(k)) index.set(k, doc._id);
  return index;
}

/**
 * Xử lý các PDF của một email. Trả về "budget" nếu hết hạn mức AI (email sẽ được xử lý lại ở lần sau).
 */
async function processMessage(parsed, config, ctx) {
  const pdfs = (parsed.attachments || []).filter(isPdf).slice(0, MAX_PDFS_PER_MESSAGE);
  if (!pdfs.length) {
    ctx.stats.skipped++;
    return "ok";
  }
  const filenames = pdfs.map((p) => p.filename || "");
  if (!matchesKeywords(config.subjectKeywords, parsed.subject, filenames)) {
    ctx.stats.skipped++;
    return "ok";
  }

  const sender = (parsed.from && parsed.from.value && parsed.from.value[0]) || {};
  ctx.stats.withPdf++;

  for (const att of pdfs) {
    if (att.content.length > MAX_PDF_BYTES) {
      ctx.stats.skipped++;
      continue;
    }
    const hash = crypto.createHash("sha256").update(att.content).digest("hex");
    if (await MailCv.exists({ attachmentHash: hash })) {
      ctx.stats.duplicatesSkipped++;
      continue;
    }

    let prefill = {};
    let profile = null;
    let parseError;
    const flags = [];

    let text = "";
    try {
      text = String((await withTimeout(pdfParse(att.content), 20000, "Đọc PDF quá lâu")).text || "").trim();
    } catch (e) {
      parseError = "Không đọc được file PDF";
    }

    if (text.length >= 50) {
      if (ctx.budget.ai <= 0) return "budget";
      ctx.budget.ai--;
      // Lỗi AI (chưa cấu hình, hết hạn mức, quá tải) làm dừng cả lần chạy để thử lại sau, không bỏ sót CV
      const result = await ai.extractCv(text.slice(0, MAX_CV_CHARS)).catch((e) => {
        throw Object.assign(e, { fatal: true });
      });
      prefill = result.prefill;
      profile = sanitizeProfile(result.profile);
      if (!prefill.name && !prefill.phone && !prefill.email && !(profile.skills || []).length) {
        ctx.stats.notCv++; // PDF không phải CV (hóa đơn, brochure...)
        continue;
      }
    } else {
      flags.push("scanned");
      parseError = parseError || "PDF không có chữ (có thể là bản scan) nên chưa trích xuất được. Hãy xem file và nhập tay.";
    }

    if (!prefill.email && sender.address) {
      prefill.email = sender.address; // dự phòng: email người gửi
      flags.push("email_from_sender");
    }
    if (!prefill.name && sender.name) prefill.name = sender.name;
    if (!keysOf(prefill).length) flags.push("missing_contact");

    const index = (ctx.index = ctx.index || (await loadEmployeeIndex()));
    const duplicateOf = keysOf(prefill).map((k) => index.get(k)).find(Boolean);
    if (duplicateOf) flags.push("duplicate");

    const file = await CvFile.create({
      filename: String(att.filename || "cv.pdf").slice(0, 200),
      size: att.content.length,
      data: att.content,
      expiresAt: new Date(Date.now() + PENDING_TTL_MS), // hàng chờ không duyệt sau 30 ngày sẽ tự xóa file
    });

    let created;
    try {
      created = await MailCv.create({
        messageId: parsed.messageId,
        from: sender.address,
        fromName: sender.name,
        subject: String(parsed.subject || "").slice(0, 300),
        receivedAt: parsed.date || new Date(),
        attachmentName: file.filename,
        attachmentHash: hash,
        cvFileId: file._id,
        prefill,
        profile,
        parseError,
        flags,
        duplicateOfEmployeeId: duplicateOf,
      });
      ctx.stats.queued++;
    } catch (e) {
      await CvFile.findByIdAndDelete(file._id);
      if (e.code === 11000) ctx.stats.duplicatesSkipped++;
      else throw e;
      continue;
    }

    // Tự nhập: chỉ CV "sạch" (có chữ, họ tên thật, SĐT/email, không trùng). Mọi trường hợp còn lại giữ ở hàng chờ.
    if (config.autoApprove && !parseError && !flags.length && String(prefill.name || "").trim()) {
      try {
        await mailCv.approve(created._id, {}, undefined);
        ctx.stats.queued--;
        ctx.stats.autoApproved = (ctx.stats.autoApproved || 0) + 1;
        if (ctx.index) for (const k of keysOf(prefill)) ctx.index.set(k, created._id); // các CV sau trong cùng lần quét thấy ứng viên này
      } catch (e) {
        ctx.stats.autoFailed = (ctx.stats.autoFailed || 0) + 1; // vẫn nằm ở hàng chờ để duyệt tay
      }
    }
  }
  return "ok";
}

/** Quét hộp thư một lần. Chỉ đọc; tiến độ (UID đã xử lý) luôn được lưu kể cả khi lỗi giữa chừng. */
exports.run = async (config, trigger = "manual") => {
  const tenant = getTenant();
  if (!tenant || !tenant.companyId) throw new Error("Tenant context missing");

  const started = Date.now();
  const stats = { scanned: 0, withPdf: 0, queued: 0, duplicatesSkipped: 0, notCv: 0, skipped: 0, failed: 0 };
  const progress = { lastUid: config.lastUid || 0, uidValidity: config.uidValidity };
  const ctx = { stats, budget: { ai: MAX_AI_PER_RUN }, index: null };
  let client;
  let error;

  try {
    const full = await MailboxConfig.findById(config._id).select("+passwordEnc");
    if (!full) throw httpError(404, "Chưa cấu hình hộp thư");
    const password = secretBox.decrypt(full.passwordEnc);

    client = await openClient({ host: full.host, port: full.port, secure: full.secure, user: full.user, password });
    await client.connect();
    const lock = await client.getMailboxLock(full.folder || "INBOX", { readOnly: true });
    try {
      const validity = Number(client.mailbox.uidValidity);
      if (full.uidValidity && validity !== Number(full.uidValidity)) progress.lastUid = 0; // hộp thư bị dựng lại: quét lại từ đầu (đã có chống trùng)
      progress.uidValidity = validity;

      const criteria = progress.lastUid > 0 ? { uid: `${progress.lastUid + 1}:*` } : { since: new Date(Date.now() - full.sinceDays * 24 * 60 * 60 * 1000) };
      // Lưu ý IMAP: "n:*" luôn trả về ít nhất thư cuối cùng, nên phải lọc lại theo UID
      const uids = ((await client.search(criteria, { uid: true })) || [])
        .filter((u) => u > progress.lastUid)
        .sort((a, b) => a - b)
        .slice(0, MAX_MESSAGES_PER_RUN);

      for (const uid of uids) {
        stats.scanned++;
        try {
          const meta = await client.fetchOne(uid, { size: true, uid: true }, { uid: true });
          if (meta && meta.size > MAX_MESSAGE_BYTES) {
            stats.skipped++;
          } else {
            const msg = await client.fetchOne(uid, { source: true, uid: true }, { uid: true });
            const parsed = await simpleParser(msg.source);
            if ((await processMessage(parsed, full, ctx)) === "budget") break;
          }
        } catch (e) {
          if (e.fatal) throw e;
          stats.failed++; // thư hỏng: bỏ qua, không chặn các thư khác
        }
        progress.lastUid = uid;
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    error = err.fatal ? err : friendlyConnectError(err);
  } finally {
    if (client) await client.logout().catch(() => {});
  }

  const entry = { at: new Date(), trigger, ok: !error, error: error && error.message, stats, durationMs: Date.now() - started };
  await MailboxConfig.updateOne(
    { _id: config._id },
    {
      $set: { lastUid: progress.lastUid, uidValidity: progress.uidValidity, lastRunAt: entry.at, runningSince: null },
      $push: { history: { $each: [entry], $position: 0, $slice: 20 } },
    }
  );
  if (error) throw error;
  return entry;
};

exports.limits = { MAX_AI_PER_RUN, MAX_MESSAGES_PER_RUN, MAX_PDF_BYTES };
