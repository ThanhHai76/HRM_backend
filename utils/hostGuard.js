const dns = require("dns").promises;
const net = require("net");

// Địa chỉ người dùng tự nhập (máy chủ IMAP) -> chặn SSRF: không cho kết nối vào mạng nội bộ,
// loopback, link-local hay dịch vụ metadata của đám mây.
const isPrivateIPv4 = (ip) => {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
};

const isPrivateIPv6 = (ip) => {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  return mapped ? isPrivateIPv4(mapped[1]) : false;
};

exports.isPrivateAddress = (ip) => (net.isIPv4(ip) ? isPrivateIPv4(ip) : net.isIPv6(ip) ? isPrivateIPv6(ip) : true);

const ALLOWED_PORTS = new Set([993, 143]);

/**
 * Kiểm tra máy chủ và cổng; trả về địa chỉ IP đã phân giải để kết nối thẳng vào IP đó
 * (tránh bị đổi DNS giữa lúc kiểm tra và lúc kết nối).
 * Đặt MAIL_ALLOW_PRIVATE_HOSTS=true chỉ khi tự dựng máy chủ mail nội bộ và tin tưởng mọi quản trị viên.
 */
exports.assertPublicHost = async (host, port) => {
  const name = String(host || "").trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(name) || name.length > 253) {
    throw Object.assign(new Error("Địa chỉ máy chủ IMAP không hợp lệ"), { status: 422 });
  }
  if (process.env.MAIL_ALLOW_PRIVATE_HOSTS !== "true" && !ALLOWED_PORTS.has(Number(port))) {
    throw Object.assign(new Error("Chỉ hỗ trợ cổng IMAP 993 (SSL) hoặc 143"), { status: 422 });
  }
  const records = net.isIP(name) ? [{ address: name }] : await dns.lookup(name, { all: true }).catch(() => []);
  if (!records.length) throw Object.assign(new Error("Không phân giải được địa chỉ máy chủ IMAP"), { status: 422 });
  if (process.env.MAIL_ALLOW_PRIVATE_HOSTS !== "true" && records.some((r) => exports.isPrivateAddress(r.address))) {
    throw Object.assign(new Error("Địa chỉ máy chủ IMAP thuộc mạng nội bộ nên không được phép"), { status: 422 });
  }
  return { host: name, address: records[0].address };
};
