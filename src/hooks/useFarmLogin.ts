// 挂卡登录交互状态机：Start → 轮询登录状态 → 令牌输入 / 登录成功 / 超时失败
// 从 Console.tsx 抽出，便于复用与测试
//
// 登录分两条路径：
// 1. 密码登录（无需令牌）：弹窗内轮询，60 秒超时 → "登录失败，请检查账号密码"
// 2. 令牌登录：输入令牌 → 弹窗显示"提交成功" → 回桌面 → 卡片显示"正在登录，请稍后"，
//    后台轮询；提交 60 秒后自动重发一次开始挂卡命令（等效用户点击开始挂卡），
//    5 分钟内成功 → 卡片绿；仍未成功 → 卡片"令牌错误，请检查"
import { useEffect, useState } from "react";
import { apiRaw } from "../lib/api";
import type { Account } from "../pages/account-detail/types";

// ASF V6 EUserInputType：3=SteamGuard(邮箱令牌) 5=TwoFactorAuthentication(Steam令牌) 8=QrCodeLogin(二维码)
// 8 表示 ASF 询问是否二维码登录：自动提交 N（拒绝，改用密码登录）
export const INPUT_TYPES = { 3: "邮箱令牌", 5: "Steam 令牌" } as const;
export type FarmStage = "starting" | "polling" | "input" | "done" | "failed";

// 令牌后台登录状态：提交令牌后弹窗关闭，卡片异步显示登录进度；
// 持久化到 localStorage，刷新/离开页面后仍能恢复显示并继续轮询
export interface PendingLogin {
  acc: Pick<Account, "bot_name" | "server_id">;
  deadline: number;
  status: "pending" | "failed" | "done";
}

const LS_KEY = "steamji_pending_login";

// 令牌提交后等待登录成功的最长时间（5 分钟）
export const TOKEN_LOGIN_TIMEOUT = 300_000;
// 提交 60 秒后自动重发一次开始挂卡命令（等效用户点击开始挂卡）
const RETRY_DELAY = 60_000;

// 从 localStorage 恢复令牌登录状态；已过期的 pending 转为 failed（显示令牌错误）
function loadPendingLogin(): PendingLogin | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { acc?: { bot_name?: string; server_id?: number | null }; deadline?: number; status?: string };
    if (!p.acc?.bot_name) return null;
    const acc = { bot_name: p.acc.bot_name, server_id: p.acc.server_id ?? null };
    if (p.status === "failed") return { acc, deadline: p.deadline ?? 0, status: "failed" };
    if (p.status === "pending") {
      if (p.deadline && Date.now() < p.deadline) return { acc, deadline: p.deadline, status: "pending" };
      return { acc, deadline: p.deadline ?? 0, status: "failed" };
    }
    return null;
  } catch {
    return null;
  }
}

export interface FarmLoginApi {
  farming: Account | null;
  noTimeAcc: Account | null;
  pendingLogin: PendingLogin | null;
  lastDoneBot: string | null;
  stage: FarmStage;
  inputType: 3 | 5;
  code: string;
  msg: string;
  startFarming: (acc: Account) => void;
  submitCode: (acc: Account) => void;
  setCode: (v: string) => void;
  close: () => void;
  dismissNoTime: () => void;
}

export function useFarmLogin(onLoggedIn?: () => void): FarmLoginApi {
  const [farming, setFarming] = useState<Account | null>(null);
  const [noTimeAcc, setNoTimeAcc] = useState<Account | null>(null);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(loadPendingLogin);
  const [lastDoneBot, setLastDoneBot] = useState<string | null>(null);
  const [stage, setStage] = useState<FarmStage>("starting");
  const [inputType, setInputType] = useState<3 | 5>(3);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  // 设置并持久化令牌登录状态（done 为瞬态，不持久化）
  function applyPending(v: PendingLogin | null) {
    setPendingLogin(v);
    try {
      if (v && v.status !== "done") {
        localStorage.setItem(LS_KEY, JSON.stringify({ acc: { bot_name: v.acc.bot_name, server_id: v.acc.server_id }, deadline: v.deadline, status: v.status }));
      } else {
        localStorage.removeItem(LS_KEY);
      }
    } catch {
      // localStorage 不可用则仅内存态
    }
  }

  // 挂载时恢复持久化的令牌登录状态：刷新/重进页面后继续后台轮询
  useEffect(() => {
    if (pendingLogin?.status === "pending") {
      void waitTokenLogin(pendingLogin.acc, pendingLogin.deadline);
    }
    // 仅在挂载时恢复一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 登录成功后：先通知后端标记在线（消除 D1 低频同步滞后），再记录"刚登录成功"
  async function confirmOnline(acc: Pick<Account, "bot_name" | "server_id">) {
    try {
      await apiRaw("/api/accounts/mark-online", {
        method: "POST",
        body: JSON.stringify({ bot_name: acc.bot_name }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // 标记失败则交给低频同步兜底
    }
    setLastDoneBot(acc.bot_name);
    setTimeout(() => setLastDoneBot((cur) => (cur === acc.bot_name ? null : cur)), 30_000);
  }

  // 重新发送"开始挂卡"命令：预注入拒绝二维码 + Start，等效用户点击开始挂卡
  async function resendStart(acc: Pick<Account, "bot_name" | "server_id">) {
    try {
      await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
        method: "POST",
        body: JSON.stringify({ Type: 8, Value: "N" }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // bot 可能不存在，忽略
    }
    try {
      await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Start`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // 网络异常忽略，继续轮询
    }
  }

  // 令牌提交后的后台登录轮询：卡片显示"正在登录，请稍后"；
  // 提交 60 秒后自动重发一次开始挂卡命令（等效用户点击开始挂卡，解决
  // ASF 验证慢/卡住时需手动二次挂卡的问题）；成功 → 卡片绿；5 分钟未成功 → 令牌错误
  async function waitTokenLogin(acc: Pick<Account, "bot_name" | "server_id">, deadline = Date.now() + TOKEN_LOGIN_TIMEOUT) {
    // 自动重发时刻 = 提交时刻 + 60 秒（提交时刻 = deadline - TOKEN_LOGIN_TIMEOUT）
    const retryAt = deadline - (TOKEN_LOGIN_TIMEOUT - RETRY_DELAY);
    let retried = false;
    while (Date.now() < deadline) {
      // 到点且未重发过 → 自动重发一次开始挂卡命令（刷新恢复后若已过点也会立即补发）
      if (!retried && Date.now() >= retryAt) {
        retried = true;
        await resendStart(acc);
      }
      try {
        const resp = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}`, { method: "GET" });
        const j = (await resp.json()) as { Result?: Record<string, { RequiredInput?: number; IsConnectedAndLoggedOn?: boolean }> };
        const bot = j.Result?.[acc.bot_name];
        if (bot?.IsConnectedAndLoggedOn) {
          await confirmOnline(acc);
          applyPending({ acc, deadline, status: "done" });
          onLoggedIn?.();
          return;
        }
        // ASF 再次要求输入令牌 → 令牌未通过
        const req = bot?.RequiredInput ?? 0;
        if (req === 3 || req === 5) {
          applyPending({ acc, deadline, status: "failed" });
          return;
        }
      } catch {
        // 网络抖动，继续
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    applyPending({ acc, deadline, status: "failed" });
  }

  // 密码登录轮询（弹窗内）：60 秒超时 → "登录失败，请检查账号密码"
  async function pollLogin(acc: Account, round: number): Promise<void> {
    setStage("polling");
    if (round >= 30) {
      setStage("failed");
      setMsg("登录失败，请检查账号密码");
      return;
    }
    try {
      const resp = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}`, { method: "GET" });
      const j = (await resp.json()) as { Result?: Record<string, { RequiredInput?: number; IsConnectedAndLoggedOn?: boolean }> };
      const bot = j.Result?.[acc.bot_name];
      if (!bot) {
        setStage("failed");
        setMsg("未找到该 bot");
        return;
      }
      if (bot.IsConnectedAndLoggedOn) {
        await confirmOnline(acc);
        setStage("done");
        setMsg("登录成功");
        onLoggedIn?.();
        return;
      }
      const req = bot.RequiredInput ?? 0;
      if (req === 3 || req === 5) {
        setInputType(req);
        setStage("input");
        return; // 等待用户输入，不再自动轮询
      }
      if (req === 8) {
        // ASF 询问是否二维码登录 → 自动拒绝，改用密码登录
        setMsg("正在使用密码登录…");
        try {
          await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
            method: "POST",
            body: JSON.stringify({ Type: 8, Value: "N" }),
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          // 继续轮询
        }
        await new Promise((res) => setTimeout(res, 2000));
        return pollLogin(acc, round + 1);
      }
      await new Promise((res) => setTimeout(res, 2000));
      return pollLogin(acc, round + 1);
    } catch {
      await new Promise((res) => setTimeout(res, 2000));
      return pollLogin(acc, round + 1);
    }
  }

  async function startFarming(acc: Account) {
    if (!acc.server_id) return;
    // 无可用时间拦截：未兑换卡密（无到期）或已到期 → 弹窗引导去兑换
    if (!acc.expires_at || new Date(acc.expires_at).getTime() < Date.now()) {
      setNoTimeAcc(acc);
      return;
    }
    // 开始新挂卡：清除该账号此前的令牌后台登录状态（如"令牌错误"残留）
    applyPending(null);
    setFarming(acc);
    setStage("starting");
    setCode("");
    setMsg("");
    try {
      // 预注入：拒绝二维码登录（必须早于 Start，避免 ASF 控制台输入竞态），强制走密码登录
      try {
        await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
          method: "POST",
          body: JSON.stringify({ Type: 8, Value: "N" }),
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        // bot 可能不存在，交给 Start 处理
      }
      const r = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Start`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (j.Success === false) {
        setStage("failed");
        setMsg(j.Message || "启动失败");
        return;
      }
      await pollLogin(acc, 0);
    } catch {
      setStage("failed");
      setMsg("无法连接 ASF 服务器");
    }
  }

  async function submitCode(acc: Account) {
    if (!code.trim()) return;
    setMsg("");
    try {
      const r = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}/Input`, {
        method: "POST",
        body: JSON.stringify({ Type: inputType, Value: code.trim() }),
        headers: { "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (j.Success === false) {
        setStage("failed");
        setMsg(j.Message || "提交失败");
        return;
      }
      setCode("");
      // 弹窗显示"提交成功"，短暂停留后回桌面，卡片显示"正在登录，请稍后"
      setMsg("提交成功");
      const deadline = Date.now() + TOKEN_LOGIN_TIMEOUT;
      applyPending({ acc: { bot_name: acc.bot_name, server_id: acc.server_id }, deadline, status: "pending" });
      setTimeout(() => {
        close();
        void waitTokenLogin(acc, deadline);
      }, 1500);
    } catch {
      setStage("failed");
      setMsg("无法连接 ASF 服务器");
    }
  }

  function close() {
    setFarming(null);
    setStage("starting");
  }

  function dismissNoTime() {
    setNoTimeAcc(null);
  }

  return { farming, noTimeAcc, pendingLogin, lastDoneBot, stage, inputType, code, msg, startFarming, submitCode, setCode, close, dismissNoTime };
}
