// 注册 / 修改密码的账号与密码强度校验（复用，两处入口规则一致）
// 规则：用户名 >6 位（即 >=7，上限 32 沿用现有）；密码 >8 位（即 >=9）且至少包含一个字母和一个数字

// 校验用户名：返回错误信息或 null（合法）
export function validateUsername(username: string): string | null {
  const name = (username || "").trim();
  if (!name) return "用户名不能为空";
  if (name.length <= 6) return "用户名必须超过 6 位";
  if (name.length > 32) return "用户名过长（最多 32 字符）";
  return null;
}

// 校验密码：返回错误信息或 null（合法）
export function validatePassword(password: string): string | null {
  if (!password) return "密码不能为空";
  if (password.length <= 8) return "密码必须超过 8 位";
  if (!/[A-Za-z]/.test(password)) return "密码必须包含字母";
  if (!/[0-9]/.test(password)) return "密码必须包含数字";
  return null;
}
