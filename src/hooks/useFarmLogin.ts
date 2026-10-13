// 挂卡登录交互状态机：Start → 轮询登录状态 → 令牌输入 / 登录成功 / 超时失败
// 从 Console.tsx 抽出，便于复用与测试
//
// 登录分两条路径：
// 1. 密码登录（无需令牌）：弹窗内轮询，60 秒超时 → "登录失败，请检查账号密码"
// 2. 令牌登录：输入令牌 → 弹窗显示"提交成功" → 回桌面 → 卡片显示"正在登录，请稍后"，
//    后台轮询；每次提交令牌后 60 秒自动重发一次开始挂卡命令（等效用户点击开始挂卡），
//    每次自动重发计一次失败（attempts+1）；ASF 要求令牌时自动重弹输入框让用户继续输入；
//    第 3 次输入后 60 秒 ASF 仍未反馈登录成功 → 中止，提示检查账号密码后回到点挂卡前状态。
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
  deadline: number; // = 提交令牌时刻 + 60 秒（自动重发与第 3 轮结论的时刻）
  attempts: number; // 已发生的自动重发次数（每次自动重发 +1，达到 3 中止）
  status: "pending" | "done";
}

const LS_KEY = "steamji_pending_login";

// 每次提交令牌后 60 秒自动重发开始挂卡命令
const RETRY_AFTER = 60_000;
// 自动重发计失败次数上限：第 3 次输入后 60 秒仍未反馈登录成功 → 中止
export const MAX_ATTEMPTS = 3;
const FAIL_MSG = "长时间未登录成功，请检查账号密码，或等待一段时间后重新登陆";

// 从 localStorage 恢复令牌登录状态；done/旧格式数据清理后返回 null
function loadPendingLogin(): PendingLogin | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { acc?: { bot_name?: string; server_id?: number | null }; deadline?: number; attempts?: number; status?: string };
    if (!p.acc?.bot_name) return null;
    const acc = { bot_name: p.acc.bot_name, server_id: p.acc.server_id ?? null };
    if (p.status === "pending") {
      return { acc, deadline: p.deadline ?? Date.now() + RETRY_AFTER, attempts: p.attempts ?? 0, status: "pending" };
    }
    // done 或历史 failed 数据：清理，不再阻塞卡片
    localStorage.removeItem(LS_KEY);
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
        localStorage.setItem(LS_KEY, JSON.stringify({ acc: { bot_name: v.acc.bot_name, server_id: v.acc.server_id }, deadline: v.deadline, attempts: v.attempts, status: v.status }));
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
      void waitTokenLogin(pendingLogin.acc, pendingLogin.deadline, pendingLogin.attempts);
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

  // 中止：弹出"长时间未登录成功"提示并清除后台状态，回到点挂卡前
  function abort(acc: Pick<Account, "bot_name" | "server_id">) {
    applyPending(null);
    setFarming(acc as Account);
    setStage("failed");
    setMsg(FAIL_MSG);
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
  // 提交后 60 秒自动重发一次开始挂卡命令（等效用户点击开始挂卡）并计一次失败；
  // ASF 要求令牌时：attempts < 3 → 自动重弹输入框（等效点挂卡后的下一步）；
  // attempts >= 3（第 3 次输入后 60 秒仍未反馈登录成功）→ 中止
  async function waitTokenLogin(acc: Pick<Account, "bot_name" | "server_id">, deadline: number, attempts: number) {
    let retried = false;
    while (true) {
      try {
        const resp = await apiRaw(`/api/proxy/${acc.server_id}/Api/Bot/${encodeURIComponent(acc.bot_name)}`, { method: "GET" });
        const j = (await resp.json()) as { Result?: Record<string, { RequiredInput?: number; IsConnectedAndLoggedOn?: boolean }> };
        const bot = j.Result?.[acc.bot_name];
        if (bot?.IsConnectedAndLoggedOn) {
          await confirmOnline(acc);
          applyPending({ acc, deadline, attempts, status: "done" });
          onLoggedIn?.();
          return;
        }
        // ASF 要求再次输入令牌
        const req = bot?.RequiredInput ?? 0;
        if (req === 3 || req === 5) {
          if (attempts >= MAX_ATTEMPTS) {
            abort(acc);
            return;
          }
          // 自动重弹令牌输入框（等效手动点开始挂卡的下一步），本轮后台循环结束，等待用户提交
          setInputType(req);
          setStage("input");
          setFarming(acc as Account);
          return;
        }
      } catch {
        // 网络抖动，继续
      }
      // 提交后 60 秒：自动重发开始挂卡命令（计一次失败）
      if (!retried && Date.now() >= deadline) {
        retried = true;
        const next = attempts + 1;
        applyPending({ acc, deadline, attempts: next, status: "pending" });
        await resendStart(acc);
        if (next >= MAX_ATTEMPTS) {
          abort(acc);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
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
    // 开始新挂卡：清除该账号此前的令牌后台登录状态（如残留的"正在登录"）
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
      // 弹窗显示"提交成功"，短暂停留后自动回桌面，卡片显示"正在登录，请稍后"
      setMsg("提交成功");
      const attempts = pendingLogin?.attempts ?? 0;
      const deadline = Date.now() + RETRY_AFTER;
      applyPending({ acc: { bot_name: acc.bot_name, server_id: acc.server_id }, deadline, attempts, status: "pending" });
      setTimeout(() => {
        close(true); // 自动关闭，保留 pendingLogin 进入后台等待
        void waitTokenLogin(acc, deadline, attempts);
      }, 1500);
    } catch {
      setStage("failed");
      setMsg("无法连接 ASF 服务器");
    }
  }

  // 关闭弹窗；auto=true 为提交成功后的自动关闭（保留令牌后台状态），
  // 手动关闭（用户点 X / 关闭）则清除令牌后台状态，回到点挂卡前
  function close(auto = false) {
    if (!auto) applyPending(null);
    setFarming(null);
    setStage("starting");
  }

  function dismissNoTime() {
    setNoTimeAcc(null);
  }

  return { farming, noTimeAcc, pendingLogin, lastDoneBot, stage, inputType, code, msg, startFarming, submitCode, setCode, close, dismissNoTime };
}
