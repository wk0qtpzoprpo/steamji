-- 令牌账号丢数据恢复（v1.4.6）：auth_type 记录登录方式（password/2fa），
-- auth_state 记录需人工重登状态（login_required/account_error），login_fail_count 累计连续登录失败
ALTER TABLE steam_accounts ADD COLUMN auth_type TEXT;
ALTER TABLE steam_accounts ADD COLUMN auth_state TEXT;
ALTER TABLE steam_accounts ADD COLUMN login_fail_count INTEGER DEFAULT 0;
