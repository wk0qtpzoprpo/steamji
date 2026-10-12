-- 在线状态：EPersonaState（0=离线 1=在线 2=忙碌 7=隐身），默认离线
ALTER TABLE steam_accounts ADD COLUMN online_status INTEGER NOT NULL DEFAULT 0;
