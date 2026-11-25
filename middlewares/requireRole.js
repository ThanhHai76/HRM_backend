// Dùng sau verifyToken: requireRole("admin", "hr")
module.exports = (...roles) => (request, response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
        return response.status(403).send('Forbidden');
    }
    next();
};
