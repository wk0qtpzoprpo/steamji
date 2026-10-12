-- 0006_display_name.sql
-- 自定义"正在玩"显示名称（挂卡模式 CustomGamePlayedWhileFarming / 挂时长模式 play 命令带名称）
-- 注：若线上已执行过含 display_name 的旧 0006（扫码版），此文件列已存在，重复执行会报"duplicate column"，可忽略。
ALTER TABLE steam_accounts ADD COLUMN display_name TEXT;
ALTER TABLE play_sessions ADD COLUMN display_name TEXT;
