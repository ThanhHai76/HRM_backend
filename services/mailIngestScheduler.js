const MailboxConfig = require("../models/MailboxConfig");
const ingest = require("./mailIngestService");
const { runWithTenant } = require("../utils/tenantContext");

const TICK_MS = 60 * 1000;
const STALE_LOCK_MS = 15 * 60 * 1000;

// Một lượt kiểm tra: quét hộp thư của các công ty đã bật và đến hạn. Trả về số cấu hình đã chạy.
async function tick(now = new Date()) {
  // Truy vấn xuyên công ty chỉ dành cho tác vụ nền của server (skipTenant)
  const configs = await MailboxConfig.find({ enabled: true }).setOptions({ skipTenant: true });
  let ran = 0;

  for (const config of configs) {
    const dueAt = config.lastRunAt ? new Date(config.lastRunAt).getTime() + config.intervalMinutes * 60 * 1000 : 0;
    if (dueAt > now.getTime()) continue;

    const locked = await MailboxConfig.findOneAndUpdate(
      { _id: config._id, $or: [{ runningSince: null }, { runningSince: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } }] },
      { $set: { runningSince: now } },
      { skipTenant: true }
    );
    if (!locked) continue;

    const tenant = { companyId: config.companyId, userId: null, role: "system" };
    try {
      await runWithTenant(tenant, () => ingest.run(config, "schedule"));
    } catch (err) {
      console.warn(`[mail-ingest] công ty ${config.companyId}: ${err.message}`);
    }
    ran++;
  }
  return ran;
}

let timer = null;
function start() {
  if (timer) return;
  timer = setInterval(() => tick().catch((e) => console.warn("[mail-ingest] tick lỗi:", e.message)), TICK_MS);
  timer.unref();
  console.log("[mail-ingest] bộ lập lịch nhận CV từ email đã bật (kiểm tra mỗi phút)");
}

module.exports = { start, tick };
