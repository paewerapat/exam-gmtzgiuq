-- 20261105-01-exam-release-date.sql
--
-- Task:    docs/dev-loop/10-release-date.md (วันเผยแพร่ของชุดข้อสอบ ใช้จัดลำดับการแสดงผล)
-- Entity:  src/exams/exam.entity.ts -> Exam.releaseDate
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT/ORDER BY/INSERT column นี้ ถ้าไม่มีจะ error
--          ทุกหน้าที่แสดงรายการชุดข้อสอบและการสร้าง/แก้ชุดข้อสอบ)
--
-- เพิ่ม 1 column:
--   exams.releaseDate datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
--     = วันเผยแพร่ เรียงรายการชุดข้อสอบด้วย releaseDate DESC, createdAt DESC
--     ข้อมูลเดิม backfill = createdAt (ปัดเป็นวินาที) ลำดับบนเว็บจึงเท่าเดิมจนแอดมินแก้
--     ชุดที่สร้างใหม่โดยไม่ส่งค่า = เวลาปัจจุบันของ DB (DEFAULT) เหมือน createdAt
--
-- ขั้นตอน: เพิ่มแบบ NULL -> UPDATE ค่าเดิม = createdAt -> MODIFY เป็น NOT NULL DEFAULT CURRENT_TIMESTAMP
-- ไม่ลบหรือแก้ข้อมูลอื่น ไม่เพิ่ม index (จำนวนชุดข้อสอบน้อย การเรียงในหน่วยความจำเร็วพอ)
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ทีละคำสั่งตามลำดับ
--
-- A1) ตรวจก่อน: ถ้าได้ 0 แถว = ยังไม่มี column -> ทำ A2
--     ถ้าได้ 1 แถว = มีแล้ว -> ข้าม A2 ไปทำ A3 ได้เลย
--
-- SHOW COLUMNS FROM `exams` LIKE 'releaseDate';
--
-- A2) เพิ่ม column (ถ้ารันซ้ำจะได้ #1060 Duplicate column name 'releaseDate' = มีแล้ว ไม่เสียหาย)
--
-- ALTER TABLE `exams` ADD COLUMN `releaseDate` datetime NULL;
--
-- A3) ใส่ค่าข้อมูลเดิม = createdAt (รันซ้ำได้ แก้เฉพาะแถวที่ยังว่าง ไม่ทับค่าที่แอดมินตั้ง)
--
-- UPDATE `exams` SET `releaseDate` = `createdAt` WHERE `releaseDate` IS NULL;
--
-- A4) บังคับ NOT NULL + ค่าเริ่มต้น = เวลาปัจจุบัน (รันซ้ำได้)
--
-- ALTER TABLE `exams` MODIFY COLUMN `releaseDate` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP;
--
--     ถ้า A4 error เพราะมีแถวที่ releaseDate เป็น NULL (เช่น #1138 Invalid use of NULL value
--     หรือ #1265 Data truncated — มีชุดข้อสอบใหม่ถูกสร้างระหว่าง A3 กับ A4 ด้วย API ตัวเดิม)
--     ไม่มีอะไรเสียหาย ให้รัน A3 (UPDATE) ซ้ำ แล้วรัน A4 อีกครั้ง
--
-- A5) ตรวจผล: ต้องได้ 1 แถว Type = datetime, Null = NO,
--     Default = CURRENT_TIMESTAMP (MariaDB แสดง current_timestamp())
--
-- SHOW COLUMNS FROM `exams` LIKE 'releaseDate';
--
--     และต้องได้ 0 (ไม่มีแถวที่ว่าง)
--
-- SELECT COUNT(*) AS missing FROM `exams` WHERE `releaseDate` IS NULL;
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อน แล้ว ALTER ผ่าน prepared statement
--  ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)

-- B1) exams.releaseDate (NULL ชั่วคราว)
SET @lumo_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'releaseDate'
);

SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `releaseDate` datetime NULL',
  'SELECT ''exams.releaseDate already exists - skipped'' AS info'
);

PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B2) ข้อมูลเดิม = createdAt (เฉพาะแถวที่ยังว่าง ไม่ทับค่าที่แอดมินตั้งแล้ว)
UPDATE `exams` SET `releaseDate` = `createdAt` WHERE `releaseDate` IS NULL;

-- B3) NOT NULL + DEFAULT (ตรงกับ TypeORM: type 'datetime', default CURRENT_TIMESTAMP)
ALTER TABLE `exams`
  MODIFY COLUMN `releaseDate` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ตรวจผล: ต้องได้ 1 แถว exams | releaseDate | datetime | NO | CURRENT_TIMESTAMP
--         (MariaDB: current_timestamp())
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exams'
  AND COLUMN_NAME = 'releaseDate';

-- และต้องได้ missing = 0
SELECT COUNT(*) AS missing FROM `exams` WHERE `releaseDate` IS NULL;
