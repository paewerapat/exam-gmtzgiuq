-- 20261115-01-pro-codes.sql
--
-- Task:    docs/dev-loop/19-pro-codes.md (lumo3 งานที่ 3 ส่วนสุดท้าย: โค้ด Unlock ที่ให้สิทธิ์ Pro + โค้ดส่วนลด Pro)
-- Entity:  src/unlock-codes/unlock-code-batch.entity.ts  -> unlock_code_batches + kind, proPlanId
--          src/pro/pro-discount-code.entity.ts           -> pro_discount_codes (ใหม่)
--          src/pro/pro-discount-redemption.entity.ts     -> pro_discount_redemptions (ใหม่)
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT unlock_code_batches.kind ทุกครั้งที่กรอกโค้ด/เปิดหน้าแอดมิน
--          โค้ด Unlock และ JOIN pro_discount_codes ในหน้าแอดมินการชำระเงิน ถ้าไม่มีจะ error 500)
--          ต้องรัน 20261110-01-unlock-codes.sql, 20261113-01-pro-membership.sql และ 20261114-01-pro-payments.sql มาก่อนแล้ว
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: เพิ่ม 2 column ใน unlock_code_batches + สร้าง 2 ตารางใหม่
--   unlock_code_batches.kind       varchar(20) NOT NULL DEFAULT 'exam'
--                                  'exam' = Unlock ชุดข้อสอบ (แบบเดิม), 'pro' = ให้แพ็กเกจ Pro
--                                  แคมเปญเดิมทั้งหมดได้ 'exam' อัตโนมัติจาก DEFAULT (ทำงานเหมือนเดิม)
--   unlock_code_batches.proPlanId  varchar(36) NULL แพ็กเกจที่ให้ (เฉพาะ kind 'pro', ไม่มี FK)
--   pro_discount_codes             โค้ดส่วนลดที่แอดมินตั้ง (code UNIQUE เก็บตัวพิมพ์ใหญ่) แบบ percent (1–100)
--                                  หรือ amount (สตางค์) จำกัดสนาม/แพ็กเกจ/ช่วงเวลา/จำนวนครั้งได้
--                                  venueId / planId ไม่มี FK (แพ็กเกจที่ถูกลบ = โค้ดใช้กับอะไรไม่ได้)
--   pro_discount_redemptions       การใช้โค้ดแต่ละครั้ง 1 แถวต่อ payment (paymentId UNIQUE)
--                                  status reserved (รอชำระ) / used (ชำระสำเร็จ) / released (ล้มเหลว/หมดอายุ/เปลี่ยนโค้ด)
--
-- FK มีเฉพาะ pro_discount_redemptions.codeId -> pro_discount_codes.id (NO ACTION: ลบโค้ดที่มีการใช้ไม่ได้;
--   API ไม่มีการลบโค้ด) ไม่มี FK ไป users / pro_payments / pro_plans / pro_venues
-- ตารางใหม่ไม่ระบุ charset จึงใช้ค่า default ของ database เหมือนตารางเดิม ต้องตรวจข้อ A3 ว่า Collation
-- ตรงกับ users / pro_plans / pro_payments (ไม่ตรงจะ JOIN ไม่ได้ #1267 Illegal mix of collations) ถ้าไม่ตรงใช้ A4
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
-- CREATE TABLE IF NOT EXISTS รันซ้ำได้ (ตารางมีอยู่แล้ว = ได้ warning ไม่เสียหาย)
-- ALTER ... ADD COLUMN ถ้าได้ #1060 Duplicate column name = มี column แล้ว ไม่เสียหาย
--   (ALTER อยู่ท้าย A2 เพราะ error จะหยุดคำสั่งที่เหลือในชุดเดียวกัน; ALTER เพิ่ม 2 column ในคำสั่งเดียว
--    จึงได้ครบหรือไม่ได้เลย)
--
-- A1) ตรวจก่อน: ต้องมีตาราง unlock_code_batches และ pro_payments แล้ว (ไม่มี = ให้รันไฟล์ก่อนหน้าก่อน)
--     และดูว่ามี column/ตารางของงานนี้แล้วหรือยัง
--
-- SHOW TABLES LIKE 'unlock\_code\_batches';
-- SHOW TABLES LIKE 'pro\_%';
-- SHOW COLUMNS FROM `unlock_code_batches` WHERE Field IN ('kind','proPlanId');
--
-- A2) สร้างตารางและเพิ่ม column (รันทั้ง 3 คำสั่งพร้อมกันได้ ลำดับสำคัญ: pro_discount_codes ก่อน
--     pro_discount_redemptions เพราะมี FK)
--
-- CREATE TABLE IF NOT EXISTS `pro_discount_codes` (
--   `id` varchar(36) NOT NULL,
--   `code` varchar(40) NOT NULL,
--   `description` varchar(255) NULL,
--   `discountType` varchar(10) NOT NULL,
--   `discountValue` int NOT NULL,
--   `venueId` varchar(36) NULL,
--   `planId` varchar(36) NULL,
--   `startsAt` datetime NULL,
--   `endsAt` datetime NULL,
--   `maxRedemptions` int NULL,
--   `perUserLimit` int NOT NULL DEFAULT 1,
--   `isActive` tinyint NOT NULL DEFAULT 1,
--   `redeemedCount` int NOT NULL DEFAULT 0,
--   `createdById` varchar(36) NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `UQ_pro_discount_codes_code` (`code`)
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `pro_discount_redemptions` (
--   `id` varchar(36) NOT NULL,
--   `codeId` varchar(36) NOT NULL,
--   `userId` varchar(36) NOT NULL,
--   `paymentId` varchar(36) NOT NULL,
--   `amountSatang` int NOT NULL,
--   `status` varchar(20) NOT NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `UQ_pro_discount_redemptions_payment` (`paymentId`),
--   KEY `IDX_pro_discount_redemptions_code_status` (`codeId`, `status`),
--   KEY `IDX_pro_discount_redemptions_code_user` (`codeId`, `userId`),
--   CONSTRAINT `FK_pro_discount_redemptions_code` FOREIGN KEY (`codeId`) REFERENCES `pro_discount_codes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
-- ) ENGINE=InnoDB;
--
-- ALTER TABLE `unlock_code_batches` ADD COLUMN `kind` varchar(20) NOT NULL DEFAULT 'exam', ADD COLUMN `proPlanId` varchar(36) NULL;
--
-- A3) ตรวจผล
--     - SHOW TABLES ต้องได้ 8 ตาราง pro_customers, pro_discount_codes, pro_discount_redemptions, pro_page,
--       pro_payments, pro_plans, pro_subscriptions, pro_venues
--
-- SHOW TABLES LIKE 'pro\_%';
--
--     - column ใหม่ 2 แถว: kind (varchar(20), Null NO, Default exam), proPlanId (varchar(36), Null YES)
--       และแคมเปญเดิมทุกแถวต้องได้ kind = exam (ผลแถวเดียว kind = exam, จำนวน = จำนวนแคมเปญทั้งหมด)
--
-- SHOW COLUMNS FROM `unlock_code_batches` WHERE Field IN ('kind','proPlanId');
-- SELECT `kind`, COUNT(*) FROM `unlock_code_batches` GROUP BY `kind`;
--
--     - Collation: ดูคอลัมน์ "Collation" ของทุกแถว ต้องเหมือนกันทั้ง 5 แถว
--
-- SHOW TABLE STATUS WHERE Name IN ('users','pro_plans','pro_payments','pro_discount_codes','pro_discount_redemptions');
--
--       เหมือนกันทั้งหมด = เสร็จแล้ว ไม่ต้องทำ A4
--       pro_discount_codes / pro_discount_redemptions ต่างจาก pro_plans = ทำ A4 (ไม่งั้น API จะ error #1267 ตอน JOIN)
--
-- A4) แก้ collation ของ 2 ตารางใหม่ให้ตรงกับ pro_plans (ทำเฉพาะเมื่อ A3 บอกว่าไม่ตรง)
--     คัดลอกทั้งบล็อก A4 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - อ่าน collation จาก pro_plans.id เอง (pro_plans ต้องมีข้อมูลอย่างน้อย 1 แถว ซึ่งมีจาก seed ของ 20261113-01)
--     - ลบแล้วสร้าง 2 ตารางใหม่ด้วย collation นั้น เฉพาะตอนที่ทั้งสองตารางยังไม่มีข้อมูล (ก่อน deploy API)
--       ถ้ามีข้อมูลแล้วจะไม่ทำอะไร แสดง "skipped" — กรณีนี้ให้แจ้งทีม dev
--     ผลแถวแรกจะแสดง collation ที่ใช้และ action ("recreate" หรือ "skipped: ...")
--     เสร็จแล้วรันคำสั่ง SHOW TABLE STATUS ของ A3 อีกครั้ง ต้องเหมือนกันทั้ง 5 แถว
--
-- -- A4 begin
-- SET @lumo_coll := (SELECT COLLATION(`id`) FROM `pro_plans` LIMIT 1);
-- SET @lumo_rows := (SELECT COUNT(*) FROM `pro_discount_codes`) + (SELECT COUNT(*) FROM `pro_discount_redemptions`);
-- SET @lumo_go := (@lumo_coll IS NOT NULL AND @lumo_rows = 0);
-- SELECT @lumo_coll AS pro_plans_collation, @lumo_rows AS rows_in_new_tables, IF(@lumo_go, 'recreate', IF(@lumo_coll IS NULL, 'skipped: pro_plans has no rows', 'skipped: pro_discount_codes / pro_discount_redemptions already has data')) AS action;
-- SET @lumo_ddl := IF(@lumo_go, 'DROP TABLE IF EXISTS `pro_discount_redemptions`, `pro_discount_codes`', 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_discount_codes` (`id` varchar(36) NOT NULL, `code` varchar(40) NOT NULL, `description` varchar(255) NULL, `discountType` varchar(10) NOT NULL, `discountValue` int NOT NULL, `venueId` varchar(36) NULL, `planId` varchar(36) NULL, `startsAt` datetime NULL, `endsAt` datetime NULL, `maxRedemptions` int NULL, `perUserLimit` int NOT NULL DEFAULT 1, `isActive` tinyint NOT NULL DEFAULT 1, `redeemedCount` int NOT NULL DEFAULT 0, `createdById` varchar(36) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_pro_discount_codes_code` (`code`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_discount_redemptions` (`id` varchar(36) NOT NULL, `codeId` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `paymentId` varchar(36) NOT NULL, `amountSatang` int NOT NULL, `status` varchar(20) NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_pro_discount_redemptions_payment` (`paymentId`), KEY `IDX_pro_discount_redemptions_code_status` (`codeId`, `status`), KEY `IDX_pro_discount_redemptions_code_user` (`codeId`, `userId`), CONSTRAINT `FK_pro_discount_redemptions_code` FOREIGN KEY (`codeId`) REFERENCES `pro_discount_codes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- -- A4 end
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (CREATE TABLE IF NOT EXISTS; column ใหม่ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน
--  prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)

-- B1) pro_discount_codes
CREATE TABLE IF NOT EXISTS `pro_discount_codes` (
  `id` varchar(36) NOT NULL,
  `code` varchar(40) NOT NULL,
  `description` varchar(255) NULL,
  `discountType` varchar(10) NOT NULL,
  `discountValue` int NOT NULL,
  `venueId` varchar(36) NULL,
  `planId` varchar(36) NULL,
  `startsAt` datetime NULL,
  `endsAt` datetime NULL,
  `maxRedemptions` int NULL,
  `perUserLimit` int NOT NULL DEFAULT 1,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `redeemedCount` int NOT NULL DEFAULT 0,
  `createdById` varchar(36) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_pro_discount_codes_code` (`code`)
) ENGINE=InnoDB;

-- B2) pro_discount_redemptions (หลัง B1 เพราะมี FK)
CREATE TABLE IF NOT EXISTS `pro_discount_redemptions` (
  `id` varchar(36) NOT NULL,
  `codeId` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `paymentId` varchar(36) NOT NULL,
  `amountSatang` int NOT NULL,
  `status` varchar(20) NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_pro_discount_redemptions_payment` (`paymentId`),
  KEY `IDX_pro_discount_redemptions_code_status` (`codeId`, `status`),
  KEY `IDX_pro_discount_redemptions_code_user` (`codeId`, `userId`),
  CONSTRAINT `FK_pro_discount_redemptions_code` FOREIGN KEY (`codeId`) REFERENCES `pro_discount_codes` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB;

-- B3) unlock_code_batches.kind (แคมเปญเดิมได้ 'exam' จาก DEFAULT)
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unlock_code_batches'
    AND COLUMN_NAME = 'kind'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `unlock_code_batches` ADD COLUMN `kind` varchar(20) NOT NULL DEFAULT ''exam''',
  'SELECT ''unlock_code_batches.kind already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B4) unlock_code_batches.proPlanId
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'unlock_code_batches'
    AND COLUMN_NAME = 'proPlanId'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `unlock_code_batches` ADD COLUMN `proPlanId` varchar(36) NULL',
  'SELECT ''unlock_code_batches.proPlanId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: 2 ตารางใหม่ (collation ต้องตรงกับ pro_plans), column ใหม่ 2 แถว, แคมเปญเดิมเป็น kind exam
SELECT t.TABLE_NAME, t.TABLE_COLLATION,
  (SELECT e.TABLE_COLLATION FROM information_schema.TABLES e
   WHERE e.TABLE_SCHEMA = DATABASE() AND e.TABLE_NAME = 'pro_plans') AS pro_plans_collation
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN ('pro_discount_codes', 'pro_discount_redemptions')
ORDER BY t.TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'unlock_code_batches' AND COLUMN_NAME IN ('kind', 'proPlanId')
ORDER BY COLUMN_NAME;

SELECT `kind`, COUNT(*) AS campaigns FROM `unlock_code_batches` GROUP BY `kind`;
