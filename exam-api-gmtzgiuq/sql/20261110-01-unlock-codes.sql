-- 20261110-01-unlock-codes.sql
--
-- Task:    docs/dev-loop/15-unlock-codes.md (lumo3 งานที่ 2 โค้ด Unlock)
-- Entity:  src/unlock-codes/unlock-code-batch.entity.ts       -> unlock_code_batches
--          src/unlock-codes/unlock-code-batch-exam.entity.ts  -> unlock_code_batch_exams
--          src/unlock-codes/unlock-code.entity.ts             -> unlock_codes
--          src/unlock-codes/unlock-code-redeem-failure.entity.ts -> unlock_code_redeem_failures
--          src/exam-access/exam-access.entity.ts              -> exam_access
--          src/exams/exam.entity.ts                           -> Exam.codeInstructions
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT exams.codeInstructions และตารางใหม่
--          ถ้าไม่มีจะ error ทุกหน้า Mock Exam, การเริ่ม/ส่งข้อสอบ และหน้าแอดมินชุดข้อสอบ)
--          ต้องรัน 20261105-02-mock-exam.sql มาก่อนแล้ว (exams.isMock/accessType)
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: สร้าง 5 ตารางใหม่ (ว่าง) + เพิ่ม 1 column ใน exams
--   unlock_code_batches          แคมเปญ (ชื่อ, ทุกชุด Mock หรือไม่, อายุสิทธิ์, วันหมดอายุโค้ด, เปิด/ปิด)
--   unlock_code_batch_exams      ชุดข้อสอบที่แคมเปญผูกไว้ (batchId, examId)
--   unlock_codes                 โค้ด (unique code, ใครใช้เมื่อไร; unique (batchId, usedByUserId)
--                                = 1 บัญชีใช้ได้ 1 โค้ดต่อแคมเปญ)
--   unlock_code_redeem_failures  การกรอกโค้ดผิด (กันเดาโค้ด: ผิดเกิน 10 ครั้ง / 15 นาที / บัญชี)
--   exam_access                  สิทธิ์เข้าทำชุดข้อสอบของผู้ใช้ (source code ตอนนี้, purchase/admin งานที่ 3)
--   exams.codeInstructions       json NULL  ขั้นตอน "วิธีรับโค้ด" (MariaDB เก็บเป็น longtext + CHECK json_valid)
--
-- FK มีเฉพาะระหว่างตารางใหม่ (unlock_codes/unlock_code_batch_exams -> unlock_code_batches)
-- ไม่มี FK ไป users/exams (กัน errno 150 ถ้า collation ของตารางเดิมต่างจากตารางใหม่)
-- ตารางใหม่ไม่ระบุ charset จึงใช้ค่า default ของ database เหมือนตารางเดิมที่ TypeORM สร้าง
-- ต้องตรวจข้อ A3 ว่า Collation ตรงกับ exams/users (ไม่ตรงจะ JOIN ไม่ได้ #1267 Illegal mix of collations)
-- ถ้าไม่ตรง ใช้ A4 (อัตโนมัติ ไม่ต้องแก้ค่า) สร้างตารางใหม่ด้วย collation ของ exams
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
-- CREATE TABLE IF NOT EXISTS รันซ้ำได้ (ตารางมีอยู่แล้ว = ได้ warning ไม่เสียหาย)
-- ALTER ... ADD COLUMN ถ้าได้ #1060 Duplicate column name = มี column แล้ว ไม่เสียหาย
--
-- A1) ตรวจก่อน: ต้องมี exams.isMock และ exams.accessType แล้ว (ไม่มี = ยังไม่ได้รัน
--     20261105-02-mock-exam.sql ให้รันไฟล์นั้นก่อน) และดูว่ามีตารางของงานนี้แล้วหรือยัง
--
-- SHOW COLUMNS FROM `exams` WHERE Field IN ('isMock','accessType','codeInstructions');
-- SHOW TABLES LIKE 'unlock_code%';
-- SHOW TABLES LIKE 'exam_access';
--
-- A2) สร้างตารางและเพิ่ม column (รันทั้ง 6 คำสั่งพร้อมกันได้)
--
-- CREATE TABLE IF NOT EXISTS `unlock_code_batches` (
--   `id` varchar(36) NOT NULL,
--   `name` varchar(150) NOT NULL,
--   `allMock` tinyint NOT NULL DEFAULT 0,
--   `accessDays` int NOT NULL,
--   `codeExpiresAt` datetime NULL,
--   `isActive` tinyint NOT NULL DEFAULT 1,
--   `codeCount` int NOT NULL DEFAULT 0,
--   `createdById` varchar(36) NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `unlock_code_batch_exams` (
--   `batchId` varchar(36) NOT NULL,
--   `examId` varchar(36) NOT NULL,
--   PRIMARY KEY (`batchId`, `examId`),
--   KEY `IDX_unlock_code_batch_exams_examId` (`examId`),
--   CONSTRAINT `FK_unlock_code_batch_exams_batch` FOREIGN KEY (`batchId`) REFERENCES `unlock_code_batches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `unlock_codes` (
--   `id` varchar(36) NOT NULL,
--   `batchId` varchar(36) NOT NULL,
--   `code` varchar(32) NOT NULL,
--   `isActive` tinyint NOT NULL DEFAULT 1,
--   `usedByUserId` varchar(36) NULL,
--   `usedAt` datetime NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `UQ_unlock_codes_code` (`code`),
--   UNIQUE KEY `UQ_unlock_codes_batch_user` (`batchId`, `usedByUserId`),
--   KEY `IDX_unlock_codes_batch_usedAt` (`batchId`, `usedAt`),
--   CONSTRAINT `FK_unlock_codes_batch` FOREIGN KEY (`batchId`) REFERENCES `unlock_code_batches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `unlock_code_redeem_failures` (
--   `id` varchar(36) NOT NULL,
--   `userId` varchar(36) NOT NULL,
--   `errorCode` varchar(32) NOT NULL,
--   `failedAt` datetime NOT NULL,
--   PRIMARY KEY (`id`),
--   KEY `IDX_unlock_code_redeem_failures_user_time` (`userId`, `failedAt`)
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `exam_access` (
--   `id` varchar(36) NOT NULL,
--   `userId` varchar(36) NOT NULL,
--   `examId` varchar(36) NULL,
--   `allMock` tinyint NOT NULL DEFAULT 0,
--   `source` enum('code','purchase','admin') NOT NULL,
--   `sourceId` varchar(36) NULL,
--   `expiresAt` datetime NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   KEY `IDX_exam_access_user_exam` (`userId`, `examId`)
-- ) ENGINE=InnoDB;
--
-- ALTER TABLE `exams` ADD COLUMN `codeInstructions` json NULL;
--
-- A3) ตรวจผล
--     - SHOW TABLES ต้องได้ 4 ตาราง unlock_code_batches, unlock_code_batch_exams,
--       unlock_code_redeem_failures, unlock_codes และ 1 ตาราง exam_access
--
-- SHOW TABLES LIKE 'unlock_code%';
-- SHOW TABLES LIKE 'exam_access';
--
--     - exams.codeInstructions: Type json (MariaDB แสดง longtext), Null YES, Default NULL
--
-- SHOW COLUMNS FROM `exams` WHERE Field = 'codeInstructions';
--
--     - ตารางใหม่ว่าง: ทุกค่าต้องเป็น 0
--
-- SELECT (SELECT COUNT(*) FROM `unlock_code_batches`) AS batches, (SELECT COUNT(*) FROM `unlock_codes`) AS codes, (SELECT COUNT(*) FROM `exam_access`) AS access_rows;
--
--     - Collation: ดูคอลัมน์ "Collation" ของทุกแถว ต้องเหมือนกันทั้ง 7 แถว
--       (exams, users และ 5 ตารางใหม่)
--
-- SHOW TABLE STATUS WHERE Name IN ('exams','users','unlock_code_batches','unlock_code_batch_exams','unlock_codes','unlock_code_redeem_failures','exam_access');
--
--       เหมือนกันทั้งหมด = เสร็จ ไม่ต้องทำ A4
--       ตารางใหม่ต่างจาก exams (เช่น exams = utf8mb4_general_ci หรือ utf8mb3_general_ci /
--       utf8_general_ci แต่ตารางใหม่ = utf8mb4_unicode_ci) = ทำ A4 (ไม่งั้น API จะ error
--       #1267 Illegal mix of collations ตอน JOIN)
--       ถ้า exams กับ users ต่างกันเอง: หยุดและแจ้งทีม dev ก่อน deploy
--
-- A4) แก้ collation ของตารางใหม่ให้ตรงกับ exams (ทำเฉพาะเมื่อ A3 บอกว่าไม่ตรง)
--     คัดลอกทั้งบล็อก A4 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - อ่าน collation จาก exams.id เอง (ใช้ได้ทั้ง utf8mb4 และ utf8mb3/utf8)
--     - ลบแล้วสร้างตารางใหม่ทั้ง 5 ด้วย collation นั้น เฉพาะตอนที่ตารางใหม่ยังไม่มีข้อมูล
--       (ก่อน deploy API) ถ้ามีข้อมูลแล้วจะไม่ทำอะไร แสดง "skipped"
--     - ใช้ DROP + CREATE แทน ALTER ... CONVERT TO เพราะ CONVERT ตารางที่มี FK ระหว่างกัน
--       จะ error (#1832/#1833 หรือ errno 150/3780)
--     ผลแถวแรกจะแสดง collation ที่ใช้และ action ("recreate" หรือ "skipped: ...")
--     เสร็จแล้วรันคำสั่ง SHOW TABLE STATUS ของ A3 อีกครั้ง ต้องเหมือนกันทั้ง 7 แถว
--
-- -- A4 begin
-- SET @lumo_coll := (SELECT COLLATION(`id`) FROM `exams` LIMIT 1);
-- SET @lumo_rows := (SELECT COUNT(*) FROM `unlock_code_batches`) + (SELECT COUNT(*) FROM `unlock_code_batch_exams`) + (SELECT COUNT(*) FROM `unlock_codes`) + (SELECT COUNT(*) FROM `exam_access`);
-- SET @lumo_go := (@lumo_coll IS NOT NULL AND @lumo_rows = 0);
-- SELECT @lumo_coll AS exams_collation, @lumo_rows AS rows_in_new_tables, IF(@lumo_go, 'recreate', IF(@lumo_coll IS NULL, 'skipped: exams has no rows', 'skipped: new tables already have data')) AS action;
-- SET FOREIGN_KEY_CHECKS = 0;
-- SET @lumo_ddl := IF(@lumo_go, 'DROP TABLE IF EXISTS `unlock_codes`, `unlock_code_batch_exams`, `unlock_code_batches`, `unlock_code_redeem_failures`, `exam_access`', 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `unlock_code_batches` (`id` varchar(36) NOT NULL, `name` varchar(150) NOT NULL, `allMock` tinyint NOT NULL DEFAULT 0, `accessDays` int NOT NULL, `codeExpiresAt` datetime NULL, `isActive` tinyint NOT NULL DEFAULT 1, `codeCount` int NOT NULL DEFAULT 0, `createdById` varchar(36) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `unlock_code_batch_exams` (`batchId` varchar(36) NOT NULL, `examId` varchar(36) NOT NULL, PRIMARY KEY (`batchId`, `examId`), KEY `IDX_unlock_code_batch_exams_examId` (`examId`), CONSTRAINT `FK_unlock_code_batch_exams_batch` FOREIGN KEY (`batchId`) REFERENCES `unlock_code_batches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `unlock_codes` (`id` varchar(36) NOT NULL, `batchId` varchar(36) NOT NULL, `code` varchar(32) NOT NULL, `isActive` tinyint NOT NULL DEFAULT 1, `usedByUserId` varchar(36) NULL, `usedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_unlock_codes_code` (`code`), UNIQUE KEY `UQ_unlock_codes_batch_user` (`batchId`, `usedByUserId`), KEY `IDX_unlock_codes_batch_usedAt` (`batchId`, `usedAt`), CONSTRAINT `FK_unlock_codes_batch` FOREIGN KEY (`batchId`) REFERENCES `unlock_code_batches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `unlock_code_redeem_failures` (`id` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `errorCode` varchar(32) NOT NULL, `failedAt` datetime NOT NULL, PRIMARY KEY (`id`), KEY `IDX_unlock_code_redeem_failures_user_time` (`userId`, `failedAt`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `exam_access` (`id` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `examId` varchar(36) NULL, `allMock` tinyint NOT NULL DEFAULT 0, `source` enum(''code'',''purchase'',''admin'') NOT NULL, `sourceId` varchar(36) NULL, `expiresAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), KEY `IDX_exam_access_user_exam` (`userId`, `examId`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET FOREIGN_KEY_CHECKS = 1;
-- -- A4 end
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (CREATE TABLE IF NOT EXISTS; column ใหม่ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน
--  prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)

-- B1) unlock_code_batches
CREATE TABLE IF NOT EXISTS `unlock_code_batches` (
  `id` varchar(36) NOT NULL,
  `name` varchar(150) NOT NULL,
  `allMock` tinyint NOT NULL DEFAULT 0,
  `accessDays` int NOT NULL,
  `codeExpiresAt` datetime NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `codeCount` int NOT NULL DEFAULT 0,
  `createdById` varchar(36) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- B2) unlock_code_batch_exams
CREATE TABLE IF NOT EXISTS `unlock_code_batch_exams` (
  `batchId` varchar(36) NOT NULL,
  `examId` varchar(36) NOT NULL,
  PRIMARY KEY (`batchId`, `examId`),
  KEY `IDX_unlock_code_batch_exams_examId` (`examId`),
  CONSTRAINT `FK_unlock_code_batch_exams_batch` FOREIGN KEY (`batchId`) REFERENCES `unlock_code_batches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB;

-- B3) unlock_codes
CREATE TABLE IF NOT EXISTS `unlock_codes` (
  `id` varchar(36) NOT NULL,
  `batchId` varchar(36) NOT NULL,
  `code` varchar(32) NOT NULL,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `usedByUserId` varchar(36) NULL,
  `usedAt` datetime NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_unlock_codes_code` (`code`),
  UNIQUE KEY `UQ_unlock_codes_batch_user` (`batchId`, `usedByUserId`),
  KEY `IDX_unlock_codes_batch_usedAt` (`batchId`, `usedAt`),
  CONSTRAINT `FK_unlock_codes_batch` FOREIGN KEY (`batchId`) REFERENCES `unlock_code_batches` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB;

-- B4) unlock_code_redeem_failures
CREATE TABLE IF NOT EXISTS `unlock_code_redeem_failures` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `errorCode` varchar(32) NOT NULL,
  `failedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `IDX_unlock_code_redeem_failures_user_time` (`userId`, `failedAt`)
) ENGINE=InnoDB;

-- B5) exam_access
CREATE TABLE IF NOT EXISTS `exam_access` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `examId` varchar(36) NULL,
  `allMock` tinyint NOT NULL DEFAULT 0,
  `source` enum('code','purchase','admin') NOT NULL,
  `sourceId` varchar(36) NULL,
  `expiresAt` datetime NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_exam_access_user_exam` (`userId`, `examId`)
) ENGINE=InnoDB;

-- B6) exams.codeInstructions
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams'
    AND COLUMN_NAME = 'codeInstructions'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `exams` ADD COLUMN `codeInstructions` json NULL',
  'SELECT ''exams.codeInstructions already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: ต้องได้ 5 ตาราง (+ collation ต้องตรงกับ exams) และ column ใหม่ 1 แถว
SELECT t.TABLE_NAME, t.TABLE_COLLATION,
  (SELECT e.TABLE_COLLATION FROM information_schema.TABLES e
   WHERE e.TABLE_SCHEMA = DATABASE() AND e.TABLE_NAME = 'exams') AS exams_collation
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN ('unlock_code_batches', 'unlock_code_batch_exams', 'unlock_codes',
                       'unlock_code_redeem_failures', 'exam_access')
ORDER BY t.TABLE_NAME;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'codeInstructions';
