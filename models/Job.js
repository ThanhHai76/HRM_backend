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
    recruitmentCost: Number,
    note: String,
});

module.exports = mongoose.model('Jobs', jobSchema);