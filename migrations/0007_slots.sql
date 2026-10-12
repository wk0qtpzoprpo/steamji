-- 0007_slots.sql
-- 卡密时长改为绑定「栏位（槽位）」而非账户：删除账户后，新账户可继承该栏位剩余时长
CREATE TABLE IF NOT EXISTS account_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  slot_index INTEGER NOT NULL,
  expires_at TEXT,
  UNIQUE(user_id, slot_index)
);
ALTER TABLE steam_accounts ADD COLUMN slot_id INTEGER;

-- 迁移：现有账户按其 id 序建槽位并继承 expires_at
INSERT INTO account_slots (user_id, slot_index, expires_at)
SELECT user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY id), expires_at
FROM steam_accounts;

-- 绑定：账户按 user_id 分组内 id 排序，序号与槽位 slot_index 一致
UPDATE steam_accounts SET slot_id = (
  SELECT asl.id FROM account_slots asl
  WHERE asl.user_id = steam_accounts.user_id
  AND asl.slot_index = (
    SELECT COUNT(*) FROM steam_accounts sa2
    WHERE sa2.user_id = steam_accounts.user_id AND sa2.id <= steam_accounts.id
  )
);

-- 兜底：无槽位的普通用户补 slot 1
INSERT INTO account_slots (user_id, slot_index)
SELECT u.id, 1 FROM users u
WHERE u.role != 'admin' AND NOT EXISTS (SELECT 1 FROM account_slots s WHERE s.user_id = u.id);
-- 兜底：无 slot 2 的普通用户补 slot 2（保证默认 2 个栏位）
INSERT INTO account_slots (user_id, slot_index)
SELECT u.id, 2 FROM users u
WHERE u.role != 'admin' AND NOT EXISTS (SELECT 1 FROM account_slots s WHERE s.user_id = u.id AND s.slot_index = 2);
