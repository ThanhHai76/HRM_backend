// Loại bỏ thông tin định danh khỏi văn bản trước khi gửi cho AI chấm điểm
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

exports.redactPII = (text) =>
  String(text || "")
    .replace(EMAIL, "[email]")
    .replace(URL_RE, "[link]")
    .replace(PHONE, "[phone]");
