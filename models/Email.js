const mongoose = require("mongoose");

const emailSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  cc: String,
  bcc: String,
  content: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

emailSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model("EmailTemplate", emailSchema);
