-- ASF IPC 控制台 · 挂时长会话（含在线状态）+ 状态切换计数

CREATE TABLE IF NOT EXISTS play_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  bot_name TEXT NOT NULL,
  server_id INTEGER NOT NULL,
  app_ids TEXT NOT NULL,
  online_status INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_play_sessions_account ON play_sessions(account_id, status);
CREATE INDEX IF NOT EXISTS idx_play_sessions_user ON play_sessions(user_id, status);

-- 在线状态切换计数（1 小时内最多 3 次）
CREATE TABLE IF NOT EXISTS status_switches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  switched_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_switches_account ON status_switches(account_id, switched_at);
