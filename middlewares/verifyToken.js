const jwt = require('jsonwebtoken');
const { runWithTenant } = require('../utils/tenantContext');

// Chấp nhận token từ nhiều header để tương thích FE hiện tại (X-AUTH-TOKEN)
// và header chuẩn (Authorization: Bearer <token>) / auth-token cũ.
const extractToken = (request) => {
    const authorization = request.header('authorization');
    if (authorization && authorization.startsWith('Bearer ')) {
        return authorization.slice(7);
    }
    return request.header('x-auth-token') || request.header('auth-token');
};

const tenantOf = (user) => ({
    companyId: user.companyId,
    userId: user._id,
    role: user.role,
});

const verifyToken = (request, response, next) => {
    const token = extractToken(request);

    if (!token || token === 'null' || token === 'undefined') {
        return response.status(401).send('Access Denied');
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.TOKEN_SECRET);
    } catch (err) {
        return response.status(401).send('Invalid Token');
    }

    // Token cũ (trước khi có đa công ty) không có companyId -> đăng nhập lại
    if (!decoded.companyId) {
        return response.status(401).send('Session outdated, please login again');
    }

    request.user = decoded;
    return runWithTenant(tenantOf(decoded), next);
};

// multer/busboy có thể làm mất AsyncLocalStorage context -> gắn lại sau multer
verifyToken.bindTenant = (request, response, next) => {
    if (!request.user) return response.status(401).send('Access Denied');
    return runWithTenant(tenantOf(request.user), next);
};

module.exports = verifyToken;
