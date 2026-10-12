-- 0003: Steam 账户独立到期时间（卡密兑换"为已有账户延长时间"按账户续期）
ALTER TABLE steam_accounts ADD COLUMN expires_at TEXT;
