const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
    jobName: {
        type: String,
        required: true,
    },
    orderDate: {
        type: String,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    jobDescription: String,
    block: String,
    team: String,
    recruitmentCost: Number,
    note: String,
    // Yêu cầu có cấu trúc (AI gợi ý từ JD, nhân sự xác nhận)
    requirements: {
        mustHaveSkills: [String],
        niceToHaveSkills: [String],
        minYearsExperience: Number,
        educationLevel: String,
    },
});

jobSchema.plugin(require("../utils/tenantPlugin"));

module.exports = mongoose.model('Jobs', jobSchema);