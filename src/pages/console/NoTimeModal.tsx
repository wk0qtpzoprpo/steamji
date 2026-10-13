// 无可用时间弹窗：引导前往兑换卡密
import type { Account } from "../account-detail/types";

interface Props {
  acc: Account;
  onClose: () => void;
  onRedeem: () => void;
}

export default function NoTimeModal({ acc, onClose, onRedeem }: Props) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>无可用时间</h3>
        <div className="hint">
          「{acc.bot_name}」当前{acc.expires_at ? "使用时间已到期" : "未兑换卡密（无可用时间）"}，
          兑换卡密后可开始挂卡。
        </div>
        <div className="modal-actions">
          <button className="btn btn-sm btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-sm" onClick={onRedeem}>
            前往兑换卡密
          </button>
        </div>
      </div>
    </div>
  );
}
