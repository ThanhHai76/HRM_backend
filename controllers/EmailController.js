const nodemailer = require("nodemailer");
const handlebars = require("handlebars");
const fs = require("fs");

// Create Nodemailer transporter
const transporter = nodemailer.createTransport({
  // Configure your email provider here
  service: "Gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "thanhhai7698@gmail.com",
    pass: "dlhq qqdv pcok ptdk",
  },
});

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

    const mailOptions = {
      from: "thanhhai7698@gmail.com",
      to: email.split(","),
      cc: cc ? cc.split(",") : "",
      bcc: bcc ? bcc.split(",") : "",
      subject: subject,
      html: content,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).send("Error sending email");
      }
      res.send("Email sent successfully");
    });
    const Email = await emailService.createEmail(req.body);
    res.json({ data: Email, status: "success" });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
