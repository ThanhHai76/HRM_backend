const { redactPII } = require("./redact");

// Bỏ thông tin định danh còn sót trong văn bản tự do của hồ sơ năng lực trước khi lưu/chấm điểm
exports.sanitizeProfile = (profile) => ({
  ...profile,
  summary: redactPII(profile.summary),
  experiences: (profile.experiences || []).map((e) => ({
    ...e,
    description: redactPII(e.description),
  })),
});
