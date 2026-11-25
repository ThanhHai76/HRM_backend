const mongoose = require("mongoose");
const { getTenant } = require("./tenantContext");

const QUERY_OPS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndRemove",
  "findOneAndReplace",
  "countDocuments",
  "deleteOne",
  "deleteMany",
  "updateOne",
  "updateMany",
  "replaceOne",
];

const requireTenant = () => {
  const tenant = getTenant();
  if (!tenant || !tenant.companyId) {
    // Fail-closed: không bao giờ truy vấn dữ liệu tenant khi chưa biết công ty
    throw new Error("Tenant context missing: refusing to access company data");
  }
  return tenant;
};

/**
 * Tự động cô lập dữ liệu theo công ty:
 * - thêm trường companyId
 * - mọi query đều bị ràng buộc companyId của người dùng đang đăng nhập
 * - khi tạo mới, companyId luôn lấy từ token (bỏ qua giá trị client gửi lên)
 * - không cho phép đổi companyId qua update
 */
module.exports = function tenantPlugin(schema) {
  schema.add({
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
  });

  schema.pre(QUERY_OPS, function () {
    // Chỉ mã phía server (tác vụ nền) được đặt option này; request của người dùng không bao giờ đi qua đường này
    if (this.getOptions().skipTenant === true) return;
    const tenant = requireTenant();
    this.where({ companyId: tenant.companyId });

    const update = typeof this.getUpdate === "function" ? this.getUpdate() : null;
    if (update) {
      delete update.companyId;
      if (update.$set) delete update.$set.companyId;
      if (update.$setOnInsert) delete update.$setOnInsert.companyId;
    }
  });

  schema.pre("save", function () {
    if (this.isNew) {
      this.companyId = requireTenant().companyId;
    }
  });

  schema.pre("insertMany", function (next, docs) {
    try {
      const tenant = requireTenant();
      const list = Array.isArray(docs) ? docs : [docs];
      list.forEach((doc) => {
        if (doc) doc.companyId = tenant.companyId;
      });
      next();
    } catch (err) {
      next(err);
    }
  });
};
