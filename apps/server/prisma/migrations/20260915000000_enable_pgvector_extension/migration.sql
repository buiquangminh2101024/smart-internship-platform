-- Extension pgvector cho cột Skill.embedding vector(384).
-- Extension đã được bật tay trên Neon trước đó; migration này chỉ ghi lại vào
-- lịch sử migration để Prisma không báo drift (IF NOT EXISTS nên chạy lại an toàn).
CREATE EXTENSION IF NOT EXISTS "vector";
