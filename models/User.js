const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        min: 6,
        max: 255
    },
    email: {
        type: String,
        required: true,
        min: 6,
        max: 225
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        index: true
    },
    role: {
        type: String,
        enum: ['admin', 'hr', 'viewer'],
        default: 'hr'
    },
    password: {
        type: String,
        required: true,
        min: 6,
        max: 255
    }
});

module.exports = mongoose.model('User', userSchema);
