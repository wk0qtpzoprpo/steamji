-- 改密后旧 refresh_token 失效：refresh_valid_after 为改密时间戳，
-- refresh 接口拒绝 iat < refresh_valid_after 的旧 token（踢旧设备）
ALTER TABLE users ADD COLUMN refresh_valid_after TEXT;
