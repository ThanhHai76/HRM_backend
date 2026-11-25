const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const User = require('./../models/User');
const Company = require('./../models/Company');
const { registerValidator } = require('./../validations/auth');
const { loginLimiter, registerLimiter } = require('./../middlewares/security');

router.post('/register', registerLimiter, async (request, response) => {
    const { error } = registerValidator(request.body);

    if (error) return response.status(422).send(error.details[0].message);

    const checkEmailExist = await User.findOne({ email: request.body.email });

    if (checkEmailExist) return response.status(422).send('Email is exist');

    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(request.body.password, salt);

    // Mỗi lần đăng ký tạo một công ty mới, người đăng ký là admin của công ty đó
    const company = await Company.create({
        name: request.body.companyName || `${request.body.name} company`,
    });

    const user = new User({
        name: request.body.name,
        email: request.body.email,
        password: hashPassword,
        companyId: company._id,
        role: 'admin',
    });

    try {
        const newUser = await user.save();
        // Không trả hash mật khẩu về client
        await response.send({
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email,
        });
    } catch (err) {
        await Company.findByIdAndDelete(company._id);
        response.status(400).send(err);
    }
});

router.post('/login', loginLimiter, async (request, response) => {
    const { email, password } = request.body || {};
    // Chỉ nhận chuỗi: chặn NoSQL injection (ví dụ email: { "$gt": "" })
    if (typeof email !== 'string' || typeof password !== 'string') {
        return response.status(422).send('Email or Password is not correct');
    }

    const user = await User.findOne({ email });
    if (!user) return response.status(422).send('Email or Password is not correct');

    const checkPassword = await bcrypt.compare(password, user.password);

    if (!checkPassword) return response.status(422).send('Email or Password is not correct');

    if (!user.companyId) {
        return response.status(403).send('Account has no company. Run: node scripts/migrate-multitenant.js');
    }

    const token = jwt.sign(
        { _id: user._id, companyId: user.companyId, role: user.role },
        process.env.TOKEN_SECRET,
        { expiresIn: 60 * 60 * 24 }
    );
    response.header('auth-token', token).send({
        name: user.name,
        role: user.role,
        token: token
    });
})


module.exports = router;
