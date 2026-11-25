const { AsyncLocalStorage } = require("async_hooks");

const storage = new AsyncLocalStorage();

// ctx: { companyId, userId, role }
exports.runWithTenant = (ctx, fn) => storage.run(ctx, fn);
exports.getTenant = () => storage.getStore();
