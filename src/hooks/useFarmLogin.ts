// 挂卡登录交互状态机：Start → 轮询登录状态 → 令牌输入 / 登录成功 / 超时失败
// 从 Console.tsx 抽出，便于复用与测试
import { useState } from "react";
import { apiRaw } from "../lib/api";
import type { Account } from "../pages/account-detail/types";

// ASF V6 EUserInputType：3=SteamGuard(邮箱令牌) 5=TwoFactorAuthentication(Steam令牌) 8=QrCodeLogin(二维码)
// 8 表示 ASF 询问是否二维码登录：自动提交 N（拒绝，改用密码登录）
export const INPUT_TYPES = { 3: "邮箱令牌", 5: "Steam 令牌" } as const;
export type FarmStage = "starting" | "polling" | "input" | "done" | "failed";

export interface FarmLoginApi {
  farming: Account | null;
  noTimeAcc: Account | null;
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
  const [stage, setStage] = useState<FarmStage>("starting");
  const [inputType, setInputType] = useState<3 | 5>(3);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  async function pollLogin(acc: Account, round: number): Promise<void> {
    setStage("polling");
    if (round >= 40) {
      setStage("failed");
      setMsg("登录超时，请重试");
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
      await pollLogin(acc, 0);
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

  return { farming, noTimeAcc, stage, inputType, code, msg, startFarming, submitCode, setCode, close, dismissNoTime };
}
