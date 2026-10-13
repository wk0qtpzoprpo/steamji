// 挂卡登录弹窗：启动中 / 检查登录状态 / 输入令牌 / 登录成功 / 失败
import { INPUT_TYPES, type FarmStage } from "../../hooks/useFarmLogin";
import type { Account } from "../account-detail/types";

interface Props {
  acc: Account;
  stage: FarmStage;
  inputType: 3 | 5;
  code: string;
  msg: string;
  onCodeChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function FarmModal({ acc, stage, inputType, code, msg, onCodeChange, onSubmit, onClose }: Props) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{acc.bot_name} · 挂卡</h3>
        {stage === "starting" && <div className="hint">正在启动挂卡…</div>}
        {stage === "polling" && <div className="hint">正在检查登录状态…</div>}
        {stage === "input" && msg !== "提交成功" && (
          <>
            <div className="hint">
              ASF 需要验证：请{INPUT_TYPES[inputType]} {inputType === 3 ? "（邮件验证码）" : "（手机令牌）"}
            </div>
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder={`请输入${INPUT_TYPES[inputType]}`}
              autoFocus
            />
          </>
        )}
        {stage === "done" && <div className="ok">✓ 登录成功，挂卡已开始</div>}
        {stage === "failed" && <div className="err">{msg}</div>}
        {msg && stage !== "failed" && (
          <div className={msg === "提交成功" ? "ok ok-submit" : "hint"}>
            {msg === "提交成功" ? "✓ 令牌已提交，正在登录，请稍候…" : msg}
          </div>
        )}
        <div className="modal-actions">
          {stage === "input" && msg !== "提交成功" && (
            <button className="btn btn-sm" disabled={!code.trim()} onClick={onSubmit}>
              提交
            </button>
          )}
          <button className="btn btn-sm btn-secondary" onClick={onClose}>
            {stage === "done" ? "完成" : "关闭"}
          </button>
        </div>
      </div>
    </div>
  );
}
