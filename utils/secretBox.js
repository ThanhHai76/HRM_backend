const crypto = require("crypto");

// Mã hóa AES-256-GCM cho bí mật lưu trong DB (mật khẩu hộp thư). Khóa 32 byte lấy từ MAIL_CRED_KEY (base64 hoặc hex).
// Tạo khóa:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
const loadKey = () => {
  const raw = (process.env.MAIL_CRED_KEY || "").trim();
  if (!raw) return null;
  const candidates = [Buffer.from(raw, "base64"), Buffer.from(raw, "hex")];
  return candidates.find((b) => b.length === 32) || null;
};

exports.isConfigured = () => !!loadKey();

exports.encrypt = (plain) => {
  const key = loadKey();
  if (!key) throw Object.assign(new Error("Chưa cấu hình MAIL_CRED_KEY (khóa mã hóa 32 byte) trên máy chủ"), { status: 503 });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
};

exports.decrypt = (payload) => {
  const key = loadKey();
  if (!key) throw Object.assign(new Error("Chưa cấu hình MAIL_CRED_KEY"), { status: 503 });
  const [version, iv, tag, data] = String(payload || "").split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Dữ liệu mã hóa không hợp lệ");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};
