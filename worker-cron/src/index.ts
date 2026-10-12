// Cron Worker：Cloudflare 定时触发 → 调用 Pages 的 /api/cron 执行任务
// Pages 项目本身不支持 Cron Triggers，由本 Worker 承担定时调度
export interface Env {
  PAGES_URL: string;
  CRON_TOKEN: string;
}

export default {
  async scheduled(controller: { cron?: string }, env: Env): Promise<void> {
    const cron = controller.cron || "";
    try {
      await fetch(`${env.PAGES_URL.replace(/\/+$/, "")}/api/cron`, {
        method: "POST",
        headers: {
          "X-Cron-Token": env.CRON_TOKEN,
          "X-Cron": cron,
        },
      });
    } catch {
      // 单次失败由 Cloudflare 下个周期自动重试，无需处理
    }
  },
};
