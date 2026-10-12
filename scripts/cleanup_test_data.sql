-- 清理全部测试残留（2026-10-12）
-- 备份: backup-d1-before-cleanup-1.3.0.sql

-- 1. 删除测试 Steam 账号（TEST/kbg0612=12, fedbfreg=13 挂在正式账号 2 下；z_lib=26 挂测试用户 27）
DELETE FROM steam_accounts WHERE id IN (12, 13, 26);
DELETE FROM play_sessions;              -- 全部为测试挂卡会话
DELETE FROM status_switches;            -- 全部为测试切换记录
DELETE FROM migration_logs;             -- 测试迁移记录

-- 2. 删除测试用户（uitest/ostest/get_/asd/qaz/z_*/slottest1）及其槽位
DELETE FROM account_slots WHERE user_id IN (3, 4, 8, 9, 10, 16, 27, 28);
DELETE FROM users WHERE id IN (3, 4, 8, 9, 10, 16, 27, 28);

-- 3. 正式账号 2 的测试槽位（TEST/fedbfreg 测试续费产生的时长，随测试账号一并清理）
DELETE FROM account_slots WHERE user_id = 2 AND slot_index IN (1, 2);

-- 4. 测试卡密（全部为测试过程创建）
DELETE FROM invite_codes;

-- 5. 旧游戏库功能（1.0 已回退）残留表
DELETE FROM refresh_quota;
DELETE FROM steam_lib_diag;
DROP TABLE IF EXISTS refresh_quota;
DROP TABLE IF EXISTS steam_lib_diag;
