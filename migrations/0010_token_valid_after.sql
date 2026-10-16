-- 改密后旧 JWT 立即失效：token_valid_after 为改密时间戳，
-- middleware 拒绝 iat < token_valid_after 的 token
ALTER TABLE users ADD COLUMN token_valid_after TEXT;
