const SheetSync = require("../models/SheetSync");
const sync = require("./sheetSyncService");
const sheets = require("./googleSheetsService");
const { runWithTenant } = require("../utils/tenantContext");

const TICK_MS = 60 * 1000;
const STALE_LOCK_MS = 10 * 60 * 1000;

// Một lượt kiểm tra: chạy đồng bộ cho các công ty đã đến hạn. Trả về số cấu hình đã chạy.
async function tick(now = new Date()) {
  if (!sheets.isConfigured()) return 0;

  // Truy vấn xuyên công ty chỉ dành cho tác vụ nền của server (skipTenant)
  const configs = await SheetSync.find({ enabled: true, verifiedAt: { $ne: null } }).setOptions({ skipTenant: true });
  let ran = 0;

  for (const config of configs) {
    const dueAt = config.lastRunAt ? new Date(config.lastRunAt).getTime() + config.intervalMinutes * 60 * 1000 : 0;
    if (dueAt > now.getTime()) continue;

    // Khóa nguyên tử để nhiều instance không chạy trùng
    const locked = await SheetSync.findOneAndUpdate(
      { _id: config._id, $or: [{ runningSince: null }, { runningSince: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } }] },
      { $set: { runningSince: now } },
      { skipTenant: true }
    );
    if (!locked) continue;

    const tenant = { companyId: config.companyId, userId: null, role: "system" };
    try {
      await runWithTenant(tenant, () => sync.run(config, "schedule"));
    } catch (err) {
      console.warn(`[sheet-sync] công ty ${config.companyId}: ${err.message}`);
    }
    ran++;
  }
  return ran;
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.warn("[sheet-sync] tick lỗi:", e.message)), TICK_MS);
  timer.unref(); // không giữ tiến trình sống chỉ vì bộ lập lịch
  console.log("[sheet-sync] bộ lập lịch đồng bộ Google Sheet đã bật (kiểm tra mỗi phút)");
}

module.exports = { start, tick };
