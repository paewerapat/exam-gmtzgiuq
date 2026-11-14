-- 20261116-01-question-bank.sql
--
-- Task:    docs/dev-loop/20-question-bank.md (lumo3 งานที่ 6: Question Bank และ Challenge Questions)
-- Entity:  src/curriculum/subject.entity.ts  -> subjects  + venueId, bankLabel
--          src/curriculum/topic.entity.ts    -> topics    + gradeLabel, term
--          src/questions/question.entity.ts  -> questions + isChallenge, index IDX_questions_topicId (topicId)
--          src/exams/exam.entity.ts          -> exams     + bankOnly
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT exams.bankOnly / questions.isChallenge ทุกครั้งที่เปิดรายการ
--          ชุดข้อสอบหรือฝึกตามบท ถ้าไม่มี column จะ error 500 ทั้งเว็บ)
--          ต้องรัน 20261113-01-pro-membership.sql (ตาราง pro_venues) มาก่อนแล้ว
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: เพิ่ม 6 column + 1 index
--   subjects.venueId     varchar(36) NULL  สนาม (pro_venues.id) ของวิชาใน Question Bank, NULL = ไม่อยู่ใน Question Bank
--                                         ไม่มี FK; API เทียบกับค่าที่ส่งเป็น parameter เท่านั้น ไม่ JOIN กับ pro_venues
--   subjects.bankLabel   varchar(60) NULL  ชื่อบนการ์ด Question Bank เช่น "ชีวะ" (NULL = ใช้ name)
--   topics.gradeLabel    varchar(30) NULL  ชั้นของบท เช่น "ม.4" (NULL = กลุ่ม "อื่น ๆ")
--   topics.term          tinyint NULL      เทอม 1/2 (NULL = ไม่ระบุ)
--   questions.isChallenge tinyint NOT NULL DEFAULT 0   ข้อ Challenge (ติดได้เฉพาะข้อในชุด bankOnly)
--   exams.bankOnly       tinyint NOT NULL DEFAULT 0    ชุด "ใช้เฉพาะ Question Bank" (ซ่อนจากรายการชุดข้อสอบทุกที่)
--   index IDX_questions_topicId (questions.topicId)   Question Bank / ฝึกตามบท ค้นข้อตามบท
-- ข้อมูลเดิมทั้งหมดได้ bankOnly = 0 และ isChallenge = 0 จาก DEFAULT → ทุกหน้าทำงานเหมือนเดิมจนกว่าแอดมินจะตั้งค่า
-- (ข้อเดิมยังไม่โผล่ใน Question Bank จนกว่าแอดมินจะผูกวิชากับสนามใน /admin/curriculum)
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
-- คำสั่งใน A2 ใช้ ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS ของ MariaDB จึงรันซ้ำได้
-- (มีอยู่แล้ว = ได้ note/warning ไม่เสียหาย)
--
-- A1) ตรวจก่อน: ต้องมีตาราง pro_venues แล้ว (ไม่มี = ให้รัน 20261113-01-pro-membership.sql ก่อน)
--     และดูว่ามี column/index ของงานนี้แล้วหรือยัง
--
-- SHOW TABLES LIKE 'pro\_venues';
-- SHOW COLUMNS FROM `subjects` WHERE Field IN ('venueId','bankLabel');
-- SHOW COLUMNS FROM `topics` WHERE Field IN ('gradeLabel','term');
-- SHOW COLUMNS FROM `questions` WHERE Field = 'isChallenge';
-- SHOW COLUMNS FROM `exams` WHERE Field = 'bankOnly';
-- SHOW INDEX FROM `questions` WHERE Column_name = 'topicId';
--
--     และดู Collation ของ question_answers.questionId เทียบกับ questions.id (สถิติ Question Bank JOIN 2 column นี้
--     ทุกครั้ง: question_answers qa INNER JOIN questions q ON q.id = qa.questionId) ต้องเหมือนกัน
--     ไม่เหมือน = หน้า Question Bank ของผู้ใช้ที่ login จะ error 500 (#1267 Illegal mix of collations) ให้ทำ A5
--
-- SHOW FULL COLUMNS FROM `question_answers` WHERE Field = 'questionId';
-- SHOW FULL COLUMNS FROM `questions` WHERE Field = 'id';
--
-- A2) เพิ่ม column และ index (รันทั้ง 5 คำสั่งพร้อมกันได้)
--
-- ALTER TABLE `subjects` ADD COLUMN IF NOT EXISTS `venueId` varchar(36) NULL, ADD COLUMN IF NOT EXISTS `bankLabel` varchar(60) NULL;
-- ALTER TABLE `topics` ADD COLUMN IF NOT EXISTS `gradeLabel` varchar(30) NULL, ADD COLUMN IF NOT EXISTS `term` tinyint NULL;
-- ALTER TABLE `questions` ADD COLUMN IF NOT EXISTS `isChallenge` tinyint NOT NULL DEFAULT 0;
-- ALTER TABLE `exams` ADD COLUMN IF NOT EXISTS `bankOnly` tinyint NOT NULL DEFAULT 0;
-- CREATE INDEX IF NOT EXISTS `IDX_questions_topicId` ON `questions` (`topicId`);
--
--     ถ้า phpMyAdmin ฟ้อง #1064 ตรงคำว่า IF NOT EXISTS (ไม่ใช่ MariaDB) ให้ใช้ชุดนี้แทน ทีละคำสั่ง
--     ได้ #1060 Duplicate column name / #1061 Duplicate key name = มีอยู่แล้ว ไม่เสียหาย ข้ามไปคำสั่งถัดไป
--
-- ALTER TABLE `subjects` ADD COLUMN `venueId` varchar(36) NULL, ADD COLUMN `bankLabel` varchar(60) NULL;
-- ALTER TABLE `topics` ADD COLUMN `gradeLabel` varchar(30) NULL, ADD COLUMN `term` tinyint NULL;
-- ALTER TABLE `questions` ADD COLUMN `isChallenge` tinyint NOT NULL DEFAULT 0;
-- ALTER TABLE `exams` ADD COLUMN `bankOnly` tinyint NOT NULL DEFAULT 0;
-- CREATE INDEX `IDX_questions_topicId` ON `questions` (`topicId`);
--
-- A3) ตรวจผล
--     - column ใหม่: subjects 2 แถว (Null YES), topics 2 แถว (Null YES), questions.isChallenge / exams.bankOnly
--       (tinyint, Null NO, Default 0) และ index IDX_questions_topicId 1 แถว
--
-- SHOW COLUMNS FROM `subjects` WHERE Field IN ('venueId','bankLabel');
-- SHOW COLUMNS FROM `topics` WHERE Field IN ('gradeLabel','term');
-- SHOW COLUMNS FROM `questions` WHERE Field = 'isChallenge';
-- SHOW COLUMNS FROM `exams` WHERE Field = 'bankOnly';
-- SHOW INDEX FROM `questions` WHERE Key_name = 'IDX_questions_topicId';
--
--     - ข้อมูลเดิมไม่เปลี่ยน: ต้องได้แถวเดียว bankOnly = 0 (จำนวน = ชุดทั้งหมด) และแถวเดียว isChallenge = 0
--
-- SELECT `bankOnly`, COUNT(*) FROM `exams` GROUP BY `bankOnly`;
-- SELECT `isChallenge`, COUNT(*) FROM `questions` GROUP BY `isChallenge`;
--
--     - Collation: ดูคอลัมน์ "Collation" ของ 2 แถวนี้ (subjects.venueId กับ pro_venues.id)
--
-- SHOW FULL COLUMNS FROM `subjects` WHERE Field = 'venueId';
-- SHOW FULL COLUMNS FROM `pro_venues` WHERE Field = 'id';
--
--       เหมือนกัน = เสร็จแล้ว ไม่ต้องทำ A4
--       ไม่เหมือน = API ยังทำงานได้ (ไม่มี JOIN ระหว่าง 2 column นี้ เทียบผ่าน parameter เท่านั้น) แต่แนะนำให้ทำ A4
--       เพื่อกัน #1267 Illegal mix of collations ถ้าวันหลังมี query JOIN 2 column นี้
--
--     - Collation ของ question_answers.questionId กับ questions.id (เหมือน A1) **ต้องเหมือนกัน**
--
-- SHOW FULL COLUMNS FROM `question_answers` WHERE Field = 'questionId';
-- SHOW FULL COLUMNS FROM `questions` WHERE Field = 'id';
--
--       เหมือนกัน = ไม่ต้องทำ A5
--       ไม่เหมือน = ต้องทำ A5 ก่อน deploy API (ไม่งั้นหน้า Question Bank ของผู้ใช้ที่ login และตัวกรอง
--       ทำแล้ว/ยังไม่ทำ/ตอบผิด จะ error 500 #1267 Illegal mix of collations)
--
-- A4) ปรับ collation ของ subjects.venueId ให้ตรงกับ pro_venues.id (ทำเฉพาะเมื่อ A3 บอกว่าไม่ตรง)
--     คัดลอกทั้งบล็อก A4 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - อ่าน collation จาก pro_venues.id เอง (pro_venues มีข้อมูลจาก seed ของ 20261113-01)
--     - MODIFY เฉพาะ column venueId (ค่าเป็น uuid ภาษาอังกฤษล้วน ไม่มีข้อมูลเสียหาย) ไม่แตะ column อื่น
--     ผลแถวแรกแสดง collation ที่ใช้และ action ("modify" หรือ "skipped: ...")
--     เสร็จแล้วรัน SHOW FULL COLUMNS ของ A3 อีกครั้ง ต้องเหมือนกัน
--
-- -- A4 begin
-- SET @lumo_coll := (SELECT COLLATION(`id`) FROM `pro_venues` LIMIT 1);
-- SET @lumo_go := (@lumo_coll IS NOT NULL);
-- SELECT @lumo_coll AS pro_venues_collation, IF(@lumo_go, 'modify', 'skipped: pro_venues has no rows') AS action;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('ALTER TABLE `subjects` MODIFY COLUMN `venueId` varchar(36) CHARACTER SET utf8mb4 COLLATE ', @lumo_coll, ' NULL'), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- -- A4 end
--
-- A5) ปรับ charset/collation ของ question_answers.questionId ให้ตรงกับ questions.id (ทำเฉพาะเมื่อ A1/A3 บอกว่าไม่ตรง)
--     คัดลอกทั้งบล็อก A5 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - อ่าน charset/collation จาก questions.id เอง (questions ต้องมีข้อมูลอย่างน้อย 1 แถว)
--     - MODIFY เฉพาะ column questionId (ค่าเป็น uuid ภาษาอังกฤษล้วน ข้อมูลไม่เสียหาย, index เดิมถูกสร้างใหม่อัตโนมัติ
--       อาจใช้เวลาตามจำนวนแถวของ question_answers) ไม่มี FK ระหว่าง 2 ตารางนี้
--     - เมื่อ charset/collation เปลี่ยนจริง MariaDB จะสร้างตาราง question_answers ใหม่ทั้งตาราง ระหว่างนั้นการเขียน
--       question_answers (บันทึกคำตอบ POST /answer-logs และการส่งข้อสอบ) จะต้องรอ ให้รันช่วงที่มีผู้ใช้น้อย
--     ผลแถวแรกแสดง charset/collation ที่ใช้และ action ("modify" หรือ "skipped: ...")
--     เสร็จแล้วรัน SHOW FULL COLUMNS ของ A3 อีกครั้ง ต้องเหมือนกัน
--
-- -- A5 begin
-- SET @lumo_cs := (SELECT CHARSET(`id`) FROM `questions` LIMIT 1);
-- SET @lumo_coll := (SELECT COLLATION(`id`) FROM `questions` LIMIT 1);
-- SET @lumo_go := (@lumo_coll IS NOT NULL);
-- SELECT @lumo_cs AS questions_charset, @lumo_coll AS questions_collation, IF(@lumo_go, 'modify', 'skipped: questions has no rows') AS action;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('ALTER TABLE `question_answers` MODIFY COLUMN `questionId` varchar(36) CHARACTER SET ', @lumo_cs, ' COLLATE ', @lumo_coll, ' NOT NULL'), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- -- A5 end
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS
--  ซึ่ง MySQL ไม่รองรับ)

-- B1) subjects.venueId
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects'
    AND COLUMN_NAME = 'venueId'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `subjects` ADD COLUMN `venueId` varchar(36) NULL',
  'SELECT ''subjects.venueId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B2) subjects.bankLabel
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects'
    AND COLUMN_NAME = 'bankLabel'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `subjects` ADD COLUMN `bankLabel` varchar(60) NULL',
  'SELECT ''subjects.bankLabel already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B3) topics.gradeLabel
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'topics'
    AND COLUMN_NAME = 'gradeLabel'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `topics` ADD COLUMN `gradeLabel` varchar(30) NULL',
  'SELECT ''topics.gradeLabel already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B4) topics.term
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'topics'
    AND COLUMN_NAME = 'term'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `topics` ADD COLUMN `term` tinyint NULL',
  'SELECT ''topics.term already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B5) questions.isChallenge (ข้อเดิมได้ 0 จาก DEFAULT)
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions'
    AND COLUMN_NAME = 'isChallenge'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `questions` ADD COLUMN `isChallenge` tinyint NOT NULL DEFAULT 0',
  'SELECT ''questions.isChallenge already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B6) exams.bankOnly (ชุดเดิมได้ 0 จาก DEFAULT)
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'bankOnly'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `bankOnly` tinyint NOT NULL DEFAULT 0',
  'SELECT ''exams.bankOnly already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B7) index IDX_questions_topicId
SET @lumo_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions'
    AND INDEX_NAME = 'IDX_questions_topicId'
);
SET @lumo_ddl := IF(
  @lumo_idx_exists = 0,
  'CREATE INDEX `IDX_questions_topicId` ON `questions` (`topicId`)',
  'SELECT ''IDX_questions_topicId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: column ใหม่ 6 แถว, index 1 แถว, ข้อมูลเดิมเป็น 0 ทั้งหมด,
-- collation ของ subjects.venueId เทียบกับ pro_venues.id (ควรเหมือนกัน ดู A3/A4) และ
-- question_answers.questionId เทียบกับ questions.id (ต้องเหมือนกัน ไม่งั้นสถิติ error #1267 ดู A3/A5)
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'subjects' AND COLUMN_NAME IN ('venueId', 'bankLabel'))
    OR (TABLE_NAME = 'topics' AND COLUMN_NAME IN ('gradeLabel', 'term'))
    OR (TABLE_NAME = 'questions' AND COLUMN_NAME = 'isChallenge')
    OR (TABLE_NAME = 'exams' AND COLUMN_NAME = 'bankOnly')
    OR (TABLE_NAME = 'pro_venues' AND COLUMN_NAME = 'id')
    OR (TABLE_NAME = 'question_answers' AND COLUMN_NAME = 'questionId')
    OR (TABLE_NAME = 'questions' AND COLUMN_NAME = 'id')
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'questions'
  AND INDEX_NAME = 'IDX_questions_topicId'
GROUP BY INDEX_NAME;

SELECT `bankOnly`, COUNT(*) AS exams FROM `exams` GROUP BY `bankOnly`;
SELECT `isChallenge`, COUNT(*) AS questions FROM `questions` GROUP BY `isChallenge`;
