-- 20261101-02-shared-passages.sql
--
-- Task:    docs/dev-loop/08-shared-passages.md (บทอ่านร่วม — ข้อชุดที่ใช้บทอ่านเดียวกัน)
-- Entity:  src/exams/exam.entity.ts         -> Exam.passages
--          src/questions/question.entity.ts -> Question.passageId
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT/INSERT 2 column นี้ ถ้าไม่มีจะ error
--          และการเช็กว่ารูปยังถูกใช้อยู่ไหมจะล้มเหลว -> API จะไม่ลบไฟล์รูปใด ๆ)
--
-- เพิ่ม 2 column (ทั้งคู่ NULL ได้ ข้อมูลเดิมไม่ต้อง backfill — API อ่านแบบ tolerant):
--   exams.passages      json NULL         = บทอ่านร่วมของข้อสอบ
--                                           [{ id, title, body, images[] }] (NULL = ไม่มี)
--   questions.passageId varchar(64) NULL  = id ของบทอ่านใน exams.passages ที่ข้อนี้ใช้
--
-- Idempotent: รันซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อน แล้ว ALTER ผ่าน prepared statement
--  ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)
-- บน MariaDB `json` คือ LONGTEXT + CHECK (json_valid(...)) ซึ่ง TypeORM อ่าน/เขียนได้เหมือน `choices`
-- ไม่ลบหรือแก้ข้อมูลเดิม

-- 1) exams.passages
SET @lumo_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'passages'
);

SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `passages` json NULL',
  'SELECT ''exams.passages already exists - skipped'' AS info'
);

PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- 2) questions.passageId
SET @lumo_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'questions'
    AND COLUMN_NAME = 'passageId'
);

SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `questions` ADD COLUMN `passageId` varchar(64) NULL',
  'SELECT ''questions.passageId already exists - skipped'' AS info'
);

PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: ต้องได้ 2 แถว
--   exams     | passages  | json (MariaDB: longtext) | YES
--   questions | passageId | varchar(64)              | YES
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'exams' AND COLUMN_NAME = 'passages')
    OR (TABLE_NAME = 'questions' AND COLUMN_NAME = 'passageId')
  );
