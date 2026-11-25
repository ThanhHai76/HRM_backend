const mongoose = require("mongoose");
const CvFile = require("../models/CvFile");
const HRMModel = require("../models/HRM");

const bad = (res, status, message) => res.status(status).json({ error: message });

// Multer giải mã tên file tiếng Việt theo latin1 -> chuyển lại về UTF-8
exports.fixFilename = (name) => {
  const fixed = Buffer.from(String(name || "cv.pdf"), "latin1").toString("utf8");
  return fixed.includes("�") ? String(name) : fixed;
};

// GET /api/ai/cv-files  — danh sách file đã gắn ứng viên (không trả nội dung file)
exports.list = async (req, res) => {
  try {
    const files = await CvFile.find({ employeeId: { $ne: null } }).sort({ createdAt: -1 });
    const employees = await HRMModel.find({ _id: { $in: files.map((f) => f.employeeId) } }).select("name phone");
    const byId = new Map(employees.map((e) => [String(e._id), e]));
    res.json({
      status: "success",
      data: files.map((f) => ({
        _id: f._id,
        filename: f.filename,
        size: f.size,
        createdAt: f.createdAt,
        employee: byId.get(String(f.employeeId)) || null,
      })),
    });
  } catch (err) {
    bad(res, 500, err.message);
  }
};

// GET /api/ai/cv-files/:id/download  — chỉ người đã đăng nhập cùng công ty
exports.download = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 400, "Invalid id");
    const file = await CvFile.findById(req.params.id).select("+data");
    if (!file) return bad(res, 404, "File not found");
    res.set({
      "Content-Type": file.contentType || "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(file.data);
  } catch (err) {
    bad(res, 500, err.message);
  }
};

// DELETE /api/ai/cv-files/:id
exports.remove = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return bad(res, 400, "Invalid id");
    const file = await CvFile.findByIdAndDelete(req.params.id);
    if (!file) return bad(res, 404, "File not found");
    if (file.employeeId) {
      await HRMModel.updateOne({ _id: file.employeeId, cvFileId: file._id }, { $unset: { cvFileId: "" } });
    }
    res.json({ status: "success" });
  } catch (err) {
    bad(res, 500, err.message);
  }
};
