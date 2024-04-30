const express = require('express');
const User = require('./../models/User');
const router = express.Router();
const verifyToken = require('./../middlewares/verifyToken');

router.get('/', verifyToken, (request, response) => {
    User.find({}).exec(function (err, users) {
        response.send(users);
    });
});

module.exports = router;
