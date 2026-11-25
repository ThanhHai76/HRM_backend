const nodemailer = require("nodemailer");
const fs = require("fs");

// Nodemailer transporter: thông tin SMTP lấy từ biến môi trường (không viết cứng trong mã nguồn).
//   SMTP_USER, SMTP_PASS   (bắt buộc; với Gmail dùng "mật khẩu ứng dụng")
//   SMTP_HOST (mặc định smtp.gmail.com), SMTP_PORT (587), SMTP_SECURE ("true" nếu dùng cổng 465)
//   SMTP_FROM (mặc định = SMTP_USER)
let transporter = null;
const getTransporter = () => {
  const { SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
};

const emailService = require("../services/emailService");

exports.getAllEmails = async (req, res) => {
  try {
    const Emails = await emailService.getAllEmails();
    res.json({ data: Emails, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createEmail = async (req, res) => {
  try {
    const Email = await emailService.createEmail(req.body);
    res.json({ data: Email, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendEmail = async (req, res) => {
  try {
    const { subject, content, email, cc, bcc } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" });
    }

    const mailer = getTransporter();
    if (!mailer) {
      return res.status(503).json({ error: "SMTP is not configured (SMTP_USER / SMTP_PASS)" });
    }

    const split = (value) => (value ? String(value).split(",").map((v) => v.trim()).filter(Boolean) : undefined);

    await mailer.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: split(email),
      cc: split(cc),
      bcc: split(bcc),
      subject,
      html: content,
    });
    res.json({ status: "success" });
  } catch (err) {
    console.error("Error sending email:", err.message);
    res.status(500).json({ error: "Error sending email" });
  }
};

exports.getEmailById = async (req, res) => {
  try {
    const Email = await emailService.getEmailById(req.params.id);
    res.json({ data: Email, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateEmail = async (req, res) => {
  try {
    const Email = await emailService.updateEmail(req.params.id, req.body);
    res.json({ data: Email, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEmail = async (req, res) => {
  try {
    const Email = await emailService.deleteEmail(req.params.id);
    res.json({ data: Email, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
