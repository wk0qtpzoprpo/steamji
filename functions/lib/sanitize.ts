// 账号字段脱敏（白名单）：普通用户可见字段仅限此处列出的键，隐藏迁移记录/服务器/密码等敏感信息
export function sanitizeAccount(row: Record<string, unknown>) {
  return {
    id: row.id,
    bot_name: row.bot_name,
    steam_username: row.steam_username,
    status: row.status,
    server_name: row.server_name ?? null,
    server_id: row.current_server_id ?? null,
    expires_at: row.expires_at ?? null,
    created_at: row.created_at,
    display_name: row.display_name ?? null,
    auth_type: row.auth_type ?? null,
    auth_state: row.auth_state ?? null,
  };
}
