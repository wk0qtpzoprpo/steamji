-- ASF IPC 控制台 · 初始 Schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  quota INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active',
  subscription_expires_at TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  tunnel_url TEXT NOT NULL,
  asf_password_iv TEXT,
  asf_password_ct TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  bot_count INTEGER NOT NULL DEFAULT 0,
  offline_since TEXT,
  last_seen TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS steam_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bot_name TEXT NOT NULL,
  steam_username TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_ct TEXT NOT NULL,
  current_server_id INTEGER,
  original_server_id INTEGER,
  migration_status TEXT NOT NULL DEFAULT 'active',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (current_server_id) REFERENCES servers(id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON steam_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_server ON steam_accounts(current_server_id);
CREATE INDEX IF NOT EXISTS idx_accounts_orig ON steam_accounts(original_server_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  duration_days INTEGER NOT NULL DEFAULT 30,
  role TEXT NOT NULL DEFAULT 'user',
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  remark TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE IF NOT EXISTS migration_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  from_server INTEGER,
  to_server INTEGER,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
