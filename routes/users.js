const express = require('express');
const User = require('./../models/User');
const router = express.Router();
const verifyToken = require('./../middlewares/verifyToken');

router.get('/', verifyToken, (request, response) => {
    // Chỉ trả user cùng công ty, không trả hash mật khẩu
    User.find({ companyId: request.user.companyId })
        .select('-password')
        .exec(function (err, users) {
            if (err) return response.status(500).send(err.message);
            response.send(users);
        });
});

module.exports = router;
