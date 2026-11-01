-- 20261101-01-question-images.sql
--
-- Task:    docs/dev-loop/07-multi-images.md (หลายรูปต่อข้อ + รูปในตัวเลือก)
-- Entity:  src/questions/question.entity.ts  -> Question.questionImages
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT column นี้ ถ้าไม่มีจะ error)
--
-- เพิ่ม column `questions.questionImages` (json, NULL) = รายการ URL รูปโจทย์
-- เรียงตามลำดับที่แสดง (สูงสุด 6) ข้อมูลเดิมเป็น NULL และยังใช้ `questionImage`
-- ได้ตามเดิม (ไม่ต้อง backfill — API/web อ่านแบบ tolerant)
-- รูปในตัวเลือก (`choices[].image`) อยู่ใน JSON column `choices` เดิม ไม่ต้องแก้ schema
--
-- Idempotent: รันซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อน แล้ว ALTER ผ่าน prepared statement
--  ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)
-- บน MariaDB `json` คือ LONGTEXT + CHECK (json_valid(...)) ซึ่ง TypeORM อ่าน/เขียนได้เหมือน `choices`
-- ไม่ลบหรือแก้ข้อมูลเดิม

SET @lumo_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'questions'
    AND COLUMN_NAME = 'questionImages'
);

SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `questions` ADD COLUMN `questionImages` json NULL AFTER `questionImage`',
  'SELECT ''questions.questionImages already exists - skipped'' AS info'
);

PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: ต้องได้ 1 แถว questionImages | json (MariaDB: longtext) | YES
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'questions'
  AND COLUMN_NAME = 'questionImages';
