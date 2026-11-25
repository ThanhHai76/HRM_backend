const mongoose = require("mongoose");
const pdfParse = require("pdf-parse");

const HRMModel = require("../models/HRM");
const JobModel = require("../models/Job");
const MatchResult = require("../models/MatchResult");
const CvFile = require("../models/CvFile");
const { fixFilename } = require("./CvFileController");
const aiService = require("../services/aiService");
const { ruleScore, combine } = require("../services/matchingService");
const { redactPII } = require("../utils/redact");

const MAX_CV_CHARS = 30000;
const DISCLAIMER =
  "Điểm do AI chỉ mang tính gợi ý. Quyết định tuyển dụng thuộc về nhân sự; hệ thống không tự động loại hay chọn ứng viên.";

const fail = (res, err) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
};

const requireId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) {
    throw aiService.httpError(400, `Invalid ${label}`);
  }
};

const { sanitizeProfile } = require("../utils/profile");

// POST /api/ai/parse-cv  (multipart: pdfFile, tuỳ chọn body.employeeId)
exports.parseCv = async (req, res) => {
  try {
    if (!req.file) throw aiService.httpError(400, "pdfFile is required");

    const { text } = await pdfParse(req.file.buffer);
    const cvText = String(text || "").trim();
    if (cvText.length < 50) {
      throw aiService.httpError(
        422,
        "Không đọc được chữ trong PDF (có thể là file scan). OCR chưa được hỗ trợ."
      );
    }

    const { profile, prefill, meta } = await aiService.extractCv(cvText.slice(0, MAX_CV_CHARS));

    // Lưu file gốc. Chưa gắn ứng viên thì tự xóa sau 24h nếu không được xác nhận lưu.
    const { employeeId } = req.body;
    if (employeeId) requireId(employeeId, "employeeId");
    const file = await CvFile.create({
      filename: fixFilename(req.file.originalname),
      size: req.file.size,
      data: req.file.buffer,
      uploadedBy: req.user._id,
      expiresAt: employeeId ? undefined : new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    let saved = false;
    if (employeeId) {
      const employee = await HRMModel.findByIdAndUpdate(employeeId, {
        cvProfile: sanitizeProfile(profile),
        cvFileId: file._id,
      });
      if (!employee) {
        await CvFile.findByIdAndDelete(file._id);
        throw aiService.httpError(404, "Employee not found");
      }
      file.employeeId = employee._id;
      await file.save();
      saved = true;
    }

    res.json({
      status: "success",
      data: { profile, prefill, fileId: file._id, savedToEmployee: saved, audit: meta },
      note: "Vui lòng kiểm tra lại thông tin trích xuất trước khi lưu.",
    });
  } catch (err) {
    fail(res, err);
  }
};

// PUT /api/ai/employees/:id/cv-profile  { profile } — lưu hồ sơ đã được nhân sự kiểm tra/chỉnh sửa
exports.saveCvProfile = async (req, res) => {
  try {
    requireId(req.params.id, "employee id");
    const p = req.body.profile;
    if (!p || typeof p !== "object") throw aiService.httpError(400, "profile is required");
    const list = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
    const profile = sanitizeProfile({
      headline: String(p.headline || ""),
      summary: String(p.summary || ""),
      skills: list(p.skills),
      totalYearsExperience: Number(p.totalYearsExperience) || 0,
      languages: list(p.languages),
      certifications: list(p.certifications),
      experiences: (Array.isArray(p.experiences) ? p.experiences : []).map((e) => ({
        title: String(e.title || ""),
        durationMonths: Number(e.durationMonths) || 0,
        description: String(e.description || ""),
      })),
      education: (Array.isArray(p.education) ? p.education : []).map((e) => ({
        level: String(e.level || ""),
        major: String(e.major || ""),
      })),
    });
    const update = { cvProfile: profile };
    const { fileId } = req.body;
    let file = null;
    if (fileId) {
      requireId(fileId, "fileId");
      file = await CvFile.findById(fileId);
      if (!file) throw aiService.httpError(404, "CV file not found");
      update.cvFileId = file._id;
    }
    const employee = await HRMModel.findByIdAndUpdate(req.params.id, update);
    if (!employee) throw aiService.httpError(404, "Employee not found");
    if (file) {
      file.employeeId = employee._id;
      file.expiresAt = undefined; // đã gắn ứng viên -> không tự xóa
      await file.save();
    }
    res.json({ status: "success", data: profile });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/ai/jobs/:id/extract-requirements  -> chỉ ĐỀ XUẤT, nhân sự xác nhận rồi lưu qua PUT /job/update-job/:id
exports.extractJobRequirements = async (req, res) => {
  try {
    requireId(req.params.id, "job id");
    const job = await JobModel.findById(req.params.id);
    if (!job) throw aiService.httpError(404, "Job not found");
    if (!job.jobDescription || job.jobDescription.trim().length < 20) {
      throw aiService.httpError(400, "Job chưa có mô tả (jobDescription)");
    }
    const { requirements, meta } = await aiService.extractRequirements(
      job.jobName,
      job.jobDescription
    );
    res.json({ status: "success", data: { requirements, audit: meta }, note: "Đề xuất từ AI, cần nhân sự xác nhận." });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/ai/match  { employeeId, jobId }
exports.match = async (req, res) => {
  try {
    const { employeeId, jobId } = req.body;
    requireId(employeeId, "employeeId");
    requireId(jobId, "jobId");

    const [employee, job] = await Promise.all([
      HRMModel.findById(employeeId),
      JobModel.findById(jobId),
    ]);
    if (!employee) throw aiService.httpError(404, "Employee not found");
    if (!job) throw aiService.httpError(404, "Job not found");
    if (!employee.cvProfile) {
      throw aiService.httpError(400, "Ứng viên chưa có hồ sơ CV đã phân tích (gọi /api/ai/parse-cv với employeeId).");
    }
    const hasRequirements =
      job.requirements &&
      ((job.requirements.mustHaveSkills || []).length || job.jobDescription);
    if (!hasRequirements) {
      throw aiService.httpError(400, "Job chưa có yêu cầu hoặc mô tả để so khớp.");
    }

    // Chỉ gửi hồ sơ năng lực đã ẩn danh; không gửi tên/email/SĐT/năm sinh
    const profile = sanitizeProfile(employee.cvProfile);
    const rule = ruleScore(profile, job.requirements || {});
    const { assessment, meta } = await aiService.assessMatch({ profile, job });

    const result = await MatchResult.create({
      employeeId: employee._id,
      jobId: job._id,
      ruleScore: rule.score,
      semanticScore: assessment.semanticScore,
      suggestedScore: combine(rule.score, assessment.semanticScore),
      breakdown: rule.breakdown,
      assessment,
      confidence: assessment.confidence,
      advisoryOnly: true,
      audit: meta,
      createdBy: req.user._id,
    });

    res.json({ status: "success", data: result, disclaimer: DISCLAIMER });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/ai/jobs/:jobId/rankings
exports.rankings = async (req, res) => {
  try {
    requireId(req.params.jobId, "jobId");
    const all = await MatchResult.find({ jobId: req.params.jobId }).sort({ createdAt: -1 });

    // Lấy kết quả mới nhất của mỗi ứng viên
    const latest = new Map();
    all.forEach((m) => {
      if (!latest.has(String(m.employeeId))) latest.set(String(m.employeeId), m);
    });

    const employees = await HRMModel.find({ _id: { $in: [...latest.keys()] } }).select(
      "name phone email job"
    );
    const byId = new Map(employees.map((e) => [String(e._id), e]));

    const data = [...latest.values()]
      .sort((a, b) => b.suggestedScore - a.suggestedScore)
      .map((m) => {
        const lastReview = m.reviews && m.reviews[m.reviews.length - 1];
        return {
          matchId: m._id,
          employee: byId.get(String(m.employeeId)) || null,
          suggestedScore: m.suggestedScore,
          ruleScore: m.ruleScore,
          semanticScore: m.semanticScore,
          confidence: m.confidence,
          missingMustHave: m.breakdown && m.breakdown.missingMustHave,
          summary: m.assessment && m.assessment.summary,
          assessment: m.assessment,
          breakdown: m.breakdown,
          audit: m.audit && { model: m.audit.model, promptVersion: m.audit.promptVersion },
          reviews: m.reviews || [],
          humanDecision: lastReview || null,
          createdAt: m.createdAt,
        };
      });

    res.json({ status: "success", data, disclaimer: DISCLAIMER });
  } catch (err) {
    fail(res, err);
  }
};

// POST /api/ai/matches/:id/review  { decision, note }  — chỉ admin/hr
exports.review = async (req, res) => {
  try {
    requireId(req.params.id, "match id");
    const { decision, note } = req.body;
    if (!["shortlist", "hold", "reject"].includes(decision)) {
      throw aiService.httpError(422, "decision must be shortlist | hold | reject");
    }
    if (!note || String(note).trim().length < 5) {
      throw aiService.httpError(422, "Cần ghi lý do quyết định (note)");
    }

    const match = await MatchResult.findById(req.params.id);
    if (!match) throw aiService.httpError(404, "Match not found");

    match.reviews.push({ decision, note: String(note).trim(), reviewerId: req.user._id });
    await match.save();

    res.json({ status: "success", data: match });
  } catch (err) {
    fail(res, err);
  }
};

// GET /api/ai/jobs/:jobId/fairness-report — chỉ admin; dùng năm sinh CHỈ để kiểm toán, không đưa vào AI
exports.fairnessReport = async (req, res) => {
  try {
    requireId(req.params.jobId, "jobId");
    const matches = await MatchResult.find({ jobId: req.params.jobId });
    const employees = await HRMModel.find({
      _id: { $in: matches.map((m) => m.employeeId) },
    }).select("birthYear");
    const birth = new Map(employees.map((e) => [String(e._id), parseInt(e.birthYear, 10)]));

    const year = new Date().getFullYear();
    const bucketOf = (y) => {
      if (!y || y < 1940 || y > year) return "unknown";
      const age = year - y;
      if (age < 25) return "<25";
      if (age < 35) return "25-34";
      if (age < 45) return "35-44";
      return "45+";
    };

    const groups = {};
    matches.forEach((m) => {
      const key = bucketOf(birth.get(String(m.employeeId)));
      const g = (groups[key] = groups[key] || { count: 0, scoreSum: 0, shortlisted: 0 });
      g.count += 1;
      g.scoreSum += m.suggestedScore || 0;
      const last = m.reviews && m.reviews[m.reviews.length - 1];
      if (last && last.decision === "shortlist") g.shortlisted += 1;
    });

    const report = Object.entries(groups).map(([bucket, g]) => ({
      ageBucket: bucket,
      count: g.count,
      avgSuggestedScore: Math.round(g.scoreSum / g.count),
      shortlistRate: Math.round((g.shortlisted / g.count) * 100),
    }));

    const reliable = report.filter((r) => r.ageBucket !== "unknown" && r.count >= 5);
    const scores = reliable.map((r) => r.avgSuggestedScore);
    const gap = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;

    res.json({
      status: "success",
      data: report,
      warning:
        gap > 10
          ? `Chênh lệch điểm trung bình giữa các nhóm tuổi là ${gap} điểm: nên rà soát lại rubric/prompt.`
          : null,
      note: "Nhóm có dưới 5 ứng viên chưa đủ để kết luận thống kê.",
    });
  } catch (err) {
    fail(res, err);
  }
};
