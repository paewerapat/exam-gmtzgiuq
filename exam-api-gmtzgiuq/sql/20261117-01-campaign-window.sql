-- 20261117-01-campaign-window.sql
--
-- Task:    docs/dev-loop/21-free-mock-redesign.md (lumo3 งานที่ 7: Free Mock Exam / ช่วงแคมเปญ)
-- Entity:  src/exams/exam.entity.ts -> Exam.campaignStartsAt, Exam.campaignEndsAt
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT/INSERT/UPDATE 2 column นี้ทุกครั้งที่เปิดหน้า
--          Mock Exam, เริ่มทำข้อสอบ, กรอกโค้ด และสร้าง/แก้ชุดข้อสอบ ถ้าไม่มี column จะ error 500)
--
-- เพิ่ม 2 column (ไม่ลบ/ไม่แก้ข้อมูลเดิม ชุดเดิมได้ NULL = แคมเปญเปิดตลอด):
--   exams.campaignStartsAt datetime NULL  = วัน-เวลาเปิดแคมเปญ (ชุด Mock ที่ accessType = code)
--   exams.campaignEndsAt   datetime NULL  = วัน-เวลาปิดแคมเปญ
--   เก็บแบบเดียวกับ exams.releaseDate (datetime ไม่มีเศษวินาที เขียน/อ่านผ่าน API ตามเขตเวลาของ process)
--   NULL ฝั่งไหน = ไม่จำกัดฝั่งนั้น; ไม่มีทั้งคู่ = "กำลังเปิด" ตลอด
-- ไม่เพิ่ม index (จำนวนชุดข้อสอบน้อย)
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ทีละคำสั่งตามลำดับ
--
-- A1) ตรวจก่อน: ได้ 0 แถว = ยังไม่มี -> ทำ A2 / ได้ 2 แถว = มีครบแล้ว ข้ามไป A3
--
-- SHOW COLUMNS FROM `exams` LIKE 'campaign%';
--
-- A2) เพิ่ม column (MariaDB รองรับ IF NOT EXISTS: รันซ้ำได้ ถ้ามีแล้วจะได้ Note 1060 แทน error
--     ถ้ามีแค่ column เดียวก็เพิ่มเฉพาะที่ขาด)
--
-- ALTER TABLE `exams` ADD COLUMN IF NOT EXISTS `campaignStartsAt` datetime NULL DEFAULT NULL, ADD COLUMN IF NOT EXISTS `campaignEndsAt` datetime NULL DEFAULT NULL;
--
-- A3) ตรวจผล: ต้องได้ 2 แถว campaignEndsAt และ campaignStartsAt
--     Type = datetime, Null = YES, Default = NULL
--
-- SHOW COLUMNS FROM `exams` LIKE 'campaign%';
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS
--  ซึ่ง MySQL ไม่รองรับ)

-- B1) exams.campaignStartsAt
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'campaignStartsAt'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `campaignStartsAt` datetime NULL DEFAULT NULL',
  'SELECT ''exams.campaignStartsAt already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B2) exams.campaignEndsAt
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'campaignEndsAt'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `campaignEndsAt` datetime NULL DEFAULT NULL',
  'SELECT ''exams.campaignEndsAt already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: ต้องได้ 2 แถว datetime | YES | NULL
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exams'
  AND COLUMN_NAME IN ('campaignStartsAt', 'campaignEndsAt')
ORDER BY COLUMN_NAME;
