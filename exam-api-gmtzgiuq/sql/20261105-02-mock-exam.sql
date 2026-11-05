-- 20261105-02-mock-exam.sql
--
-- Task:    docs/dev-loop/11-mock-exam-pages.md (หน้า Mock Exam + ตัวเลือกแอดมิน)
-- Entity:  src/exams/exam.entity.ts -> Exam.isMock, accessType, price, accessDays,
--          level, detailBlocks
-- When:    **รันหลัง 20261105-01-exam-release-date.sql และก่อน deploy API**
--          (API ใหม่ SELECT/INSERT/UPDATE column เหล่านี้ ถ้าไม่มีจะ error
--          ทุกหน้าที่แสดงรายการชุดข้อสอบ การสร้าง/แก้/ลบชุดข้อสอบ และการลบรูป)
--
-- เพิ่ม 6 column ในตาราง exams (ไม่ลบ/ไม่แก้ข้อมูลเดิม ไม่เพิ่ม index):
--   isMock        tinyint NOT NULL DEFAULT 0          ชุด Mock Exam (ชุดเดิมทั้งหมด = 0 = ชุดปกติ)
--   accessType    enum('free','code','purchase') NOT NULL DEFAULT 'free'
--                                                      มีผลเฉพาะชุด Mock
--   price         decimal(10,2) NULL                  ราคา (บาท ก่อน VAT) เมื่อ accessType = purchase
--   accessDays    int NULL                            อายุสิทธิ์หลังซื้อ (วัน)
--   level         enum('easy','medium','hard') NULL   ระดับ ง่าย/ปานกลาง/ยาก
--   detailBlocks  json NULL                           คำอธิบายชุด (ข้อความ/รูป ตามลำดับ)
--                                                      MariaDB เก็บ json เป็น longtext + CHECK json_valid
-- ข้อมูลเดิมได้ค่า DEFAULT ทั้งหมด: ชุดข้อสอบเดิมเป็นชุดปกติ แสดงผลเหมือนเดิม
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ทีละคำสั่งตามลำดับ
-- ถ้าคำสั่ง ADD COLUMN ได้ #1060 Duplicate column name = มี column นั้นแล้ว ไม่เสียหาย
-- ให้ข้ามไปคำสั่งถัดไป
--
-- A1) ตรวจก่อน: ต้องมี releaseDate แล้ว (ไม่มี = ยังไม่ได้รัน 20261105-01 ให้รันไฟล์นั้นก่อน)
--     และดูว่ามี column ของงานนี้อันไหนแล้วบ้าง
--
-- SHOW COLUMNS FROM `exams`;
--
-- A2) เพิ่ม column ทีละคำสั่ง
--
-- ALTER TABLE `exams` ADD COLUMN `isMock` tinyint NOT NULL DEFAULT 0;
-- ALTER TABLE `exams` ADD COLUMN `accessType` enum('free','code','purchase') NOT NULL DEFAULT 'free';
-- ALTER TABLE `exams` ADD COLUMN `price` decimal(10,2) NULL;
-- ALTER TABLE `exams` ADD COLUMN `accessDays` int NULL;
-- ALTER TABLE `exams` ADD COLUMN `level` enum('easy','medium','hard') NULL;
-- ALTER TABLE `exams` ADD COLUMN `detailBlocks` json NULL;
--
-- A3) ตรวจผล: ต้องได้ 6 แถว
--     isMock       tinyint(1)/tinyint  NO   0
--     accessType   enum('free','code','purchase')  NO  free
--     price        decimal(10,2)       YES  NULL
--     accessDays   int(11)/int         YES  NULL
--     level        enum('easy','medium','hard')    YES NULL
--     detailBlocks json (MariaDB แสดง longtext)    YES NULL
--
-- SHOW COLUMNS FROM `exams` WHERE Field IN ('isMock','accessType','price','accessDays','level','detailBlocks');
--
--     และชุดข้อสอบเดิมทั้งหมดต้องเป็นชุดปกติ: mock = 0
--
-- SELECT COUNT(*) AS mock FROM `exams` WHERE `isMock` <> 0;
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อน แล้ว ALTER ผ่าน prepared statement
--  ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)

-- B1) exams.isMock
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'isMock'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `isMock` tinyint NOT NULL DEFAULT 0',
  'SELECT ''exams.isMock already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B2) exams.accessType
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'accessType'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `accessType` enum(''free'',''code'',''purchase'') NOT NULL DEFAULT ''free''',
  'SELECT ''exams.accessType already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B3) exams.price
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'price'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `price` decimal(10,2) NULL',
  'SELECT ''exams.price already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B4) exams.accessDays
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'accessDays'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `accessDays` int NULL',
  'SELECT ''exams.accessDays already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B5) exams.level
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'level'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `level` enum(''easy'',''medium'',''hard'') NULL',
  'SELECT ''exams.level already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B6) exams.detailBlocks
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'detailBlocks'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `detailBlocks` json NULL',
  'SELECT ''exams.detailBlocks already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: ต้องได้ 6 แถวตามตารางในข้อ A3
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'exams'
  AND COLUMN_NAME IN ('isMock', 'accessType', 'price', 'accessDays', 'level', 'detailBlocks')
ORDER BY ORDINAL_POSITION;

-- และชุดข้อสอบเดิมเป็นชุดปกติทั้งหมด (ก่อนแอดมินตั้งชุด Mock): mock = 0
SELECT COUNT(*) AS mock FROM `exams` WHERE `isMock` <> 0;
