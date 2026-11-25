const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// ---------- Header bảo mật ----------
// CORP cross-origin: frontend ở domain khác cần tải được tài nguyên (ví dụ PDF cũ) từ API.
exports.securityHeaders = () =>
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } });

// ---------- CORS ----------
// CORS_ORIGINS="https://app.example.com,https://other.example.com". Chưa đặt thì cho phép mọi origin (có cảnh báo).
exports.corsMiddleware = () => {
  const allowed = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);

  if (!allowed.length) {
    console.warn("[security] CORS_ORIGINS chưa được đặt: đang cho phép mọi origin. Hãy đặt domain frontend khi triển khai thật.");
    return cors();
  }
  return cors({
    origin(origin, callback) {
      // Không có Origin = công cụ không phải trình duyệt (curl, server-to-server)
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  });
};

// ---------- Giới hạn tần suất ----------
// Bộ đếm lưu trong bộ nhớ của từng tiến trình; nếu chạy nhiều instance cần store dùng chung (Redis).
const base = { standardHeaders: true, legacyHeaders: false };

// Chỉ đếm lần đăng nhập thất bại: 10 lần / 15 phút / IP
exports.loginLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: "Quá nhiều lần đăng nhập sai. Vui lòng thử lại sau 15 phút.",
});

// Đăng ký: 5 lần / giờ / IP
exports.registerLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "Quá nhiều lần đăng ký từ địa chỉ này. Vui lòng thử lại sau.",
});

// Toàn bộ API: 1000 request / 15 phút / IP (đủ rộng cho văn phòng dùng chung một IP)
exports.apiLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
});

// Các endpoint tốn chi phí AI: 60 lần / 10 phút / người dùng
const perUser = (req) => (req.user && req.user._id) || "anonymous";
exports.aiLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  limit: 60,
  keyGenerator: perUser,
  message: "Đã dùng quá nhiều lượt AI trong thời gian ngắn. Vui lòng thử lại sau ít phút.",
});

// Xem trước / chạy đồng bộ Google Sheet: 20 lần / 10 phút / người dùng
exports.syncLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: perUser,
  message: "Thao tác đồng bộ quá nhanh. Vui lòng thử lại sau ít phút.",
});

// ---------- Phân quyền: viewer chỉ được xem ----------
// Ngoại lệ: các POST thực chất chỉ đọc dữ liệu.
const VIEWER_ALLOWED = new Set(["POST /api/hrm/report-current-year"]);

exports.denyViewerWrites = (req, res, next) => {
  const isRead = ["GET", "HEAD", "OPTIONS"].includes(req.method);
  if (req.user && req.user.role === "viewer" && !isRead) {
    const key = `${req.method} ${req.baseUrl}${req.path}`.replace(/\/$/, "");
    if (!VIEWER_ALLOWED.has(key)) {
      return res.status(403).json({ error: "Vai trò viewer chỉ được xem, không được thay đổi dữ liệu." });
    }
  }
  next();
};
