-- 20261112-01-question-answers.sql
--
-- Task:    docs/dev-loop/16-answer-log.md (lumo3 งานที่ 5 เก็บคำตอบรายข้อ)
-- Entity:  src/answer-logs/question-answer.entity.ts -> question_answers
-- When:    **รันก่อน deploy API** (API ใหม่เขียนตารางนี้ตอนส่งข้อสอบและ POST /answer-logs
--          ถ้าไม่มีตาราง การส่งข้อสอบยังสำเร็จ (บันทึก log ล้มจะถูกข้าม) แต่ POST /answer-logs
--          จะ error 500 และคำตอบช่วงนั้นจะไม่ถูกเก็บ)
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: สร้าง 1 ตารางใหม่ (ว่าง)
--   question_answers   1 แถวต่อ 1 คำตอบของผู้ใช้ต่อข้อ (ข้อที่ตอบเท่านั้น)
--     userId / questionId / examId / attemptId  ไม่มี FK (ข้อถูกลบ ประวัติยังอยู่;
--                                               กัน errno 150 ถ้า collation ของตารางเดิมต่างกัน)
--     mode            practice | exam (preview | pro สงวนไว้ให้งาน 8 และ 3)
--     selected        คำตอบรูปแบบเดียวกับ exam_attempts.answers (id ตัวเลือกคั่น , หรือข้อความ)
--     isCorrect       ตรวจที่ server ตอนบันทึก
--     timeSpentSec    0–86400
--     isFirstAttempt  1 = ผู้ใช้ไม่เคยมีแถวของข้อนี้มาก่อน
--     answeredAt      เวลาที่บันทึก
-- ไม่ย้ายข้อมูลย้อนหลังจาก exam_attempts (นับจากวันขึ้นระบบ)
--
-- ตารางใหม่ไม่ระบุ charset จึงใช้ค่า default ของ database เหมือนตารางเดิมที่ TypeORM สร้าง
-- ต้องตรวจข้อ A3 ว่า Collation ตรงกับ exams/users/questions (ไม่ตรงจะ JOIN ไม่ได้
-- #1267 Illegal mix of collations ตอนทำสถิติในงาน 6) ถ้าไม่ตรง ใช้ A4 (อัตโนมัติ)
--
-- *** A4 = DROP TABLE + CREATE TABLE ใหม่ ใช้ได้เฉพาะ "ก่อน deploy API" เท่านั้น ***
--     (ตอนที่ตารางยังว่าง) A4 ตรวจจำนวนแถวเอง: ถ้า question_answers มีข้อมูลแม้แถวเดียว
--     จะไม่ DROP ไม่ทำอะไร แสดง "skipped: question_answers already has data"
--     หลัง deploy API แล้ว (มีคำตอบถูกบันทึก) ห้ามใช้ A4 แก้ collation ให้แจ้งทีม dev
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
-- CREATE TABLE IF NOT EXISTS รันซ้ำได้ (ตารางมีอยู่แล้ว = ได้ warning ไม่เสียหาย)
--
-- A1) ตรวจก่อน: มีตารางนี้แล้วหรือยัง (ว่าง = ยังไม่มี ทำ A2 ต่อ)
--
-- SHOW TABLES LIKE 'question_answers';
--
-- A2) สร้างตาราง
--
-- CREATE TABLE IF NOT EXISTS `question_answers` (
--   `id` varchar(36) NOT NULL,
--   `userId` varchar(36) NOT NULL,
--   `questionId` varchar(36) NOT NULL,
--   `examId` varchar(36) NULL,
--   `attemptId` varchar(36) NULL,
--   `mode` varchar(20) NOT NULL,
--   `selected` varchar(500) NULL,
--   `isCorrect` tinyint NOT NULL,
--   `timeSpentSec` int NOT NULL DEFAULT 0,
--   `isFirstAttempt` tinyint NOT NULL,
--   `answeredAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   KEY `IDX_question_answers_user_question` (`userId`, `questionId`),
--   KEY `IDX_question_answers_questionId` (`questionId`),
--   KEY `IDX_question_answers_examId` (`examId`),
--   KEY `IDX_question_answers_attemptId` (`attemptId`)
-- ) ENGINE=InnoDB;
--
-- A3) ตรวจผล
--     - SHOW TABLES ต้องได้ 1 แถว question_answers
--
-- SHOW TABLES LIKE 'question_answers';
--
--     - column ต้องได้ 11 แถว (id ... answeredAt) และ index 5 ชื่อ
--       (PRIMARY + IDX_question_answers_*; IDX_..._user_question มี 2 แถว)
--
-- SHOW COLUMNS FROM `question_answers`;
-- SHOW INDEX FROM `question_answers`;
--
--     - ตารางใหม่ว่าง: ต้องได้ 0
--
-- SELECT COUNT(*) AS question_answer_rows FROM `question_answers`;
--
--     - Collation: ดูคอลัมน์ "Collation" ของทุกแถว ต้องเหมือนกันทั้ง 4 แถว
--       (exams, users, questions และ question_answers)
--
-- SHOW TABLE STATUS WHERE Name IN ('exams','users','questions','question_answers');
--
--       เหมือนกันทั้งหมด = เสร็จ ไม่ต้องทำ A4
--       question_answers ต่างจาก exams (เช่น exams = utf8mb4_general_ci หรือ
--       utf8mb3_general_ci / utf8_general_ci แต่ question_answers = utf8mb4_unicode_ci)
--       = ทำ A4
--       ถ้า exams, users, questions ต่างกันเอง: หยุดและแจ้งทีม dev ก่อน deploy
--
-- A4) แก้ collation ของ question_answers ให้ตรงกับ exams (ทำเฉพาะเมื่อ A3 บอกว่าไม่ตรง)
--     *** ใช้เฉพาะก่อน deploy API (ตารางยังว่าง) — DROP แล้ว CREATE ใหม่ ***
--     คัดลอกทั้งบล็อก A4 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - อ่าน collation จาก exams.id เอง (ใช้ได้ทั้ง utf8mb4 และ utf8mb3/utf8)
--     - ลบแล้วสร้างตารางใหม่ด้วย collation นั้น เฉพาะตอนที่ตารางยังไม่มีข้อมูล
--       ถ้ามีข้อมูลแล้ว (เช่น deploy API ไปแล้ว) จะข้ามตัวเองทั้งบล็อก ไม่ DROP
--       แสดง "skipped: question_answers already has data" — กรณีนี้ให้แจ้งทีม dev
--     ผลแถวแรกจะแสดง collation ที่ใช้และ action ("recreate" หรือ "skipped: ...")
--     เสร็จแล้วรันคำสั่ง SHOW TABLE STATUS ของ A3 อีกครั้ง ต้องเหมือนกันทั้ง 4 แถว
--
-- -- A4 begin
-- SET @lumo_coll := (SELECT COLLATION(`id`) FROM `exams` LIMIT 1);
-- SET @lumo_rows := (SELECT COUNT(*) FROM `question_answers`);
-- SET @lumo_go := (@lumo_coll IS NOT NULL AND @lumo_rows = 0);
-- SELECT @lumo_coll AS exams_collation, @lumo_rows AS rows_in_question_answers, IF(@lumo_go, 'recreate', IF(@lumo_coll IS NULL, 'skipped: exams has no rows', 'skipped: question_answers already has data')) AS action;
-- SET @lumo_ddl := IF(@lumo_go, 'DROP TABLE IF EXISTS `question_answers`', 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `question_answers` (`id` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `questionId` varchar(36) NOT NULL, `examId` varchar(36) NULL, `attemptId` varchar(36) NULL, `mode` varchar(20) NOT NULL, `selected` varchar(500) NULL, `isCorrect` tinyint NOT NULL, `timeSpentSec` int NOT NULL DEFAULT 0, `isFirstAttempt` tinyint NOT NULL, `answeredAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), KEY `IDX_question_answers_user_question` (`userId`, `questionId`), KEY `IDX_question_answers_questionId` (`questionId`), KEY `IDX_question_answers_examId` (`examId`), KEY `IDX_question_answers_attemptId` (`attemptId`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- -- A4 end
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+

-- B1) question_answers
CREATE TABLE IF NOT EXISTS `question_answers` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `questionId` varchar(36) NOT NULL,
  `examId` varchar(36) NULL,
  `attemptId` varchar(36) NULL,
  `mode` varchar(20) NOT NULL,
  `selected` varchar(500) NULL,
  `isCorrect` tinyint NOT NULL,
  `timeSpentSec` int NOT NULL DEFAULT 0,
  `isFirstAttempt` tinyint NOT NULL,
  `answeredAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_question_answers_user_question` (`userId`, `questionId`),
  KEY `IDX_question_answers_questionId` (`questionId`),
  KEY `IDX_question_answers_examId` (`examId`),
  KEY `IDX_question_answers_attemptId` (`attemptId`)
) ENGINE=InnoDB;

-- ตรวจผล: ต้องได้ 1 ตาราง (collation ต้องตรงกับ exams) และ index 4 ชื่อ + PRIMARY
SELECT t.TABLE_NAME, t.TABLE_COLLATION,
  (SELECT e.TABLE_COLLATION FROM information_schema.TABLES e
   WHERE e.TABLE_SCHEMA = DATABASE() AND e.TABLE_NAME = 'exams') AS exams_collation
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = 'question_answers';

SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'question_answers'
GROUP BY INDEX_NAME
ORDER BY INDEX_NAME;
