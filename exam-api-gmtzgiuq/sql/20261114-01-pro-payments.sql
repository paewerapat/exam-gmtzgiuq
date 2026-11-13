-- 20261114-01-pro-payments.sql
--
-- Task:    docs/dev-loop/18-pro-payments.md (lumo3 งานที่ 3 ส่วน 2/2 ชำระเงิน Opn Payments)
-- Entity:  src/pro/pro-customer.entity.ts      -> pro_customers (ใหม่)
--          src/pro/pro-payment.entity.ts       -> pro_payments (ใหม่)
--          src/pro/pro-subscription.entity.ts  -> pro_subscriptions + omiseScheduleId, canceledAt, lastPaymentId
--          src/pro/pro-page.entity.ts          -> pro_page + vatEnabled
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT column ใหม่ของ pro_subscriptions / pro_page ทุกครั้งที่เปิด
--          /pro/upgrade และ /pro/me ถ้าไม่มี column จะ error 500)
--          ต้องรัน 20261113-01-pro-membership.sql มาก่อนแล้ว (ตาราง pro_*)
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: สร้าง 2 ตารางใหม่ + เพิ่ม column 7 ตัวใน pro_subscriptions + 1 ตัวใน pro_page
--   pro_customers       customer ของ Opn ต่อผู้ใช้ (userId PK) เก็บเฉพาะ id ของ customer + ยี่ห้อบัตร + เลขท้าย 4 หลัก
--                       ไม่เก็บข้อมูลบัตรอื่น
--   pro_payments        การชำระแต่ละครั้ง (บัตร / PromptPay / ต่ออายุอัตโนมัติ) ยอด subtotal / vat / discount / total
--                       หน่วยสตางค์ คิดที่ server ตอนสร้าง; omiseChargeId UNIQUE (1 charge = 1 แถว กันต่ออายุซ้ำ)
--                       refundRequired = ตัดเงินแล้วแต่ไม่ได้ให้สิทธิ์ (แอดมินต้องคืนเงินใน Opn dashboard)
--   pro_subscriptions   omiseScheduleId (schedule ต่ออายุด้วยบัตร), canceledAt (ยกเลิกต่ออายุเมื่อ),
--                       lastPaymentId (การชำระล่าสุดของแถวนี้), cardBrand / cardLastDigits / omiseCardId
--                       (บัตรของแถวนี้ เก็บแค่ยี่ห้อ + เลขท้าย 4 หลัก + id บัตรของ Opn),
--                       renewalFailedAt (ตัดบัตรต่ออายุไม่สำเร็จ หยุดต่ออายุอัตโนมัติแล้ว) + index omiseScheduleId
--   pro_page.vatEnabled tinyint NOT NULL DEFAULT 0 (ปิด VAT เป็นค่าเริ่มต้น)
--
-- ไม่มี FK (กัน errno 150 ถ้า collation ต่างกัน): API ตรวจเองว่าแพ็กเกจ/สนามที่มีการชำระอ้างอิงลบไม่ได้
-- ตารางใหม่ไม่ระบุ charset จึงใช้ค่า default ของ database เหมือนตารางเดิม ต้องตรวจข้อ A3 ว่า Collation
-- ตรงกับ users/pro_plans (ไม่ตรงจะ JOIN ไม่ได้ #1267 Illegal mix of collations) ถ้าไม่ตรงใช้ A4
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
-- CREATE TABLE IF NOT EXISTS รันซ้ำได้ (ตารางมีอยู่แล้ว = ได้ warning ไม่เสียหาย)
-- ALTER ... ADD COLUMN ถ้าได้ #1060 Duplicate column name = มี column แล้ว ไม่เสียหาย
--   (ALTER อยู่ท้าย A2 เพราะ error จะหยุดคำสั่งที่เหลือในชุดเดียวกัน; ALTER ของ pro_subscriptions
--    เพิ่ม 3 column + index ในคำสั่งเดียว จึงได้ครบหรือไม่ได้เลย)
--
-- A1) ตรวจก่อน: ต้องมีตาราง pro_* 4 ตารางของ 20261113-01 แล้ว (ไม่มี = ให้รันไฟล์นั้นก่อน)
--     และดูว่ามีตาราง/column ของงานนี้แล้วหรือยัง
--
-- SHOW TABLES LIKE 'pro\_%';
-- SHOW COLUMNS FROM `pro_subscriptions` WHERE Field IN ('omiseScheduleId','canceledAt','lastPaymentId','cardBrand','cardLastDigits','omiseCardId','renewalFailedAt');
-- SHOW COLUMNS FROM `pro_page` WHERE Field = 'vatEnabled';
--
-- A2) สร้างตารางและเพิ่ม column (รันทั้ง 4 คำสั่งพร้อมกันได้)
--
-- CREATE TABLE IF NOT EXISTS `pro_customers` (
--   `userId` varchar(36) NOT NULL,
--   `omiseCustomerId` varchar(64) NOT NULL,
--   `cardBrand` varchar(30) NULL,
--   `cardLastDigits` varchar(4) NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`userId`),
--   UNIQUE KEY `UQ_pro_customers_omise` (`omiseCustomerId`)
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `pro_payments` (
--   `id` varchar(36) NOT NULL,
--   `userId` varchar(36) NOT NULL,
--   `venueId` varchar(36) NOT NULL,
--   `planId` varchar(36) NOT NULL,
--   `subscriptionId` varchar(36) NULL,
--   `method` varchar(20) NOT NULL,
--   `status` varchar(20) NOT NULL,
--   `isRenewal` tinyint NOT NULL DEFAULT 0,
--   `subtotalSatang` int NOT NULL,
--   `vatSatang` int NOT NULL DEFAULT 0,
--   `discountSatang` int NOT NULL DEFAULT 0,
--   `totalSatang` int NOT NULL,
--   `currency` varchar(3) NOT NULL DEFAULT 'THB',
--   `omiseChargeId` varchar(64) NULL,
--   `omiseScheduleId` varchar(64) NULL,
--   `failureCode` varchar(64) NULL,
--   `failureMessage` varchar(255) NULL,
--   `qrImageUrl` varchar(500) NULL,
--   `expiresAt` datetime NULL,
--   `paidAt` datetime NULL,
--   `periodStart` datetime NULL,
--   `periodEnd` datetime NULL,
--   `discountCodeId` varchar(36) NULL,
--   `refundRequired` tinyint NOT NULL DEFAULT 0,
--   `lastCheckedAt` datetime NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `UQ_pro_payments_charge` (`omiseChargeId`),
--   KEY `IDX_pro_payments_user_created` (`userId`, `createdAt`),
--   KEY `IDX_pro_payments_status_created` (`status`, `createdAt`),
--   KEY `IDX_pro_payments_subscriptionId` (`subscriptionId`),
--   KEY `IDX_pro_payments_schedule` (`omiseScheduleId`)
-- ) ENGINE=InnoDB;
--
-- ALTER TABLE `pro_page` ADD COLUMN `vatEnabled` tinyint NOT NULL DEFAULT 0;
--
-- ALTER TABLE `pro_subscriptions` ADD COLUMN `omiseScheduleId` varchar(64) NULL, ADD COLUMN `canceledAt` datetime NULL, ADD COLUMN `lastPaymentId` varchar(36) NULL, ADD COLUMN `cardBrand` varchar(30) NULL, ADD COLUMN `cardLastDigits` varchar(4) NULL, ADD COLUMN `omiseCardId` varchar(64) NULL, ADD COLUMN `renewalFailedAt` datetime NULL, ADD KEY `IDX_pro_subscriptions_schedule` (`omiseScheduleId`);
--
--     ถ้าคำสั่ง ALTER แรกได้ #1060 (มี vatEnabled แล้ว) คำสั่งที่สองจะไม่ถูกรัน ให้รันคำสั่ง ALTER ที่สองแยกอีกครั้ง
--
-- A3) ตรวจผล
--     - SHOW TABLES ต้องได้ 6 ตาราง pro_customers, pro_page, pro_payments, pro_plans, pro_subscriptions, pro_venues
--
-- SHOW TABLES LIKE 'pro\_%';
--
--     - column ใหม่: pro_subscriptions 7 แถว (ทุกตัว Null YES),
--       pro_page 1 แถว (tinyint, Null NO, Default 0)
--
-- SHOW COLUMNS FROM `pro_subscriptions` WHERE Field IN ('omiseScheduleId','canceledAt','lastPaymentId','cardBrand','cardLastDigits','omiseCardId','renewalFailedAt');
-- SHOW COLUMNS FROM `pro_page` WHERE Field = 'vatEnabled';
--
--     - Collation: ดูคอลัมน์ "Collation" ของทุกแถว ต้องเหมือนกันทั้ง 5 แถว
--
-- SHOW TABLE STATUS WHERE Name IN ('users','pro_venues','pro_plans','pro_customers','pro_payments');
--
--       เหมือนกันทั้งหมด = เสร็จแล้ว ไม่ต้องทำ A4
--       pro_customers / pro_payments ต่างจาก pro_plans = ทำ A4 (ไม่งั้น API จะ error #1267 ตอน JOIN)
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
-- SET @lumo_rows := (SELECT COUNT(*) FROM `pro_payments`) + (SELECT COUNT(*) FROM `pro_customers`);
-- SET @lumo_go := (@lumo_coll IS NOT NULL AND @lumo_rows = 0);
-- SELECT @lumo_coll AS pro_plans_collation, @lumo_rows AS rows_in_new_tables, IF(@lumo_go, 'recreate', IF(@lumo_coll IS NULL, 'skipped: pro_plans has no rows', 'skipped: pro_payments / pro_customers already has data')) AS action;
-- SET @lumo_ddl := IF(@lumo_go, 'DROP TABLE IF EXISTS `pro_payments`, `pro_customers`', 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_customers` (`userId` varchar(36) NOT NULL, `omiseCustomerId` varchar(64) NOT NULL, `cardBrand` varchar(30) NULL, `cardLastDigits` varchar(4) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`userId`), UNIQUE KEY `UQ_pro_customers_omise` (`omiseCustomerId`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_payments` (`id` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `venueId` varchar(36) NOT NULL, `planId` varchar(36) NOT NULL, `subscriptionId` varchar(36) NULL, `method` varchar(20) NOT NULL, `status` varchar(20) NOT NULL, `isRenewal` tinyint NOT NULL DEFAULT 0, `subtotalSatang` int NOT NULL, `vatSatang` int NOT NULL DEFAULT 0, `discountSatang` int NOT NULL DEFAULT 0, `totalSatang` int NOT NULL, `currency` varchar(3) NOT NULL DEFAULT ''THB'', `omiseChargeId` varchar(64) NULL, `omiseScheduleId` varchar(64) NULL, `failureCode` varchar(64) NULL, `failureMessage` varchar(255) NULL, `qrImageUrl` varchar(500) NULL, `expiresAt` datetime NULL, `paidAt` datetime NULL, `periodStart` datetime NULL, `periodEnd` datetime NULL, `discountCodeId` varchar(36) NULL, `refundRequired` tinyint NOT NULL DEFAULT 0, `lastCheckedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_pro_payments_charge` (`omiseChargeId`), KEY `IDX_pro_payments_user_created` (`userId`, `createdAt`), KEY `IDX_pro_payments_status_created` (`status`, `createdAt`), KEY `IDX_pro_payments_subscriptionId` (`subscriptionId`), KEY `IDX_pro_payments_schedule` (`omiseScheduleId`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- -- A4 end
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (CREATE TABLE IF NOT EXISTS; column/index ใหม่ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน
--  prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ)

-- B1) pro_customers
CREATE TABLE IF NOT EXISTS `pro_customers` (
  `userId` varchar(36) NOT NULL,
  `omiseCustomerId` varchar(64) NOT NULL,
  `cardBrand` varchar(30) NULL,
  `cardLastDigits` varchar(4) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`userId`),
  UNIQUE KEY `UQ_pro_customers_omise` (`omiseCustomerId`)
) ENGINE=InnoDB;

-- B2) pro_payments
CREATE TABLE IF NOT EXISTS `pro_payments` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `venueId` varchar(36) NOT NULL,
  `planId` varchar(36) NOT NULL,
  `subscriptionId` varchar(36) NULL,
  `method` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL,
  `isRenewal` tinyint NOT NULL DEFAULT 0,
  `subtotalSatang` int NOT NULL,
  `vatSatang` int NOT NULL DEFAULT 0,
  `discountSatang` int NOT NULL DEFAULT 0,
  `totalSatang` int NOT NULL,
  `currency` varchar(3) NOT NULL DEFAULT 'THB',
  `omiseChargeId` varchar(64) NULL,
  `omiseScheduleId` varchar(64) NULL,
  `failureCode` varchar(64) NULL,
  `failureMessage` varchar(255) NULL,
  `qrImageUrl` varchar(500) NULL,
  `expiresAt` datetime NULL,
  `paidAt` datetime NULL,
  `periodStart` datetime NULL,
  `periodEnd` datetime NULL,
  `discountCodeId` varchar(36) NULL,
  `refundRequired` tinyint NOT NULL DEFAULT 0,
  `lastCheckedAt` datetime NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_pro_payments_charge` (`omiseChargeId`),
  KEY `IDX_pro_payments_user_created` (`userId`, `createdAt`),
  KEY `IDX_pro_payments_status_created` (`status`, `createdAt`),
  KEY `IDX_pro_payments_subscriptionId` (`subscriptionId`),
  KEY `IDX_pro_payments_schedule` (`omiseScheduleId`)
) ENGINE=InnoDB;

-- B2b) pro_payments ที่สร้างจากไฟล์ฉบับก่อน (dev) ยังไม่มี refundRequired / index omiseScheduleId
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_payments'
    AND COLUMN_NAME = 'refundRequired'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_payments` ADD COLUMN `refundRequired` tinyint NOT NULL DEFAULT 0',
  'SELECT ''pro_payments.refundRequired already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

SET @lumo_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_payments'
    AND INDEX_NAME = 'IDX_pro_payments_schedule'
);
SET @lumo_ddl := IF(
  @lumo_idx_exists = 0,
  'ALTER TABLE `pro_payments` ADD KEY `IDX_pro_payments_schedule` (`omiseScheduleId`)',
  'SELECT ''IDX_pro_payments_schedule already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B3) pro_subscriptions.omiseScheduleId
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'omiseScheduleId'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `omiseScheduleId` varchar(64) NULL',
  'SELECT ''pro_subscriptions.omiseScheduleId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B4) pro_subscriptions.canceledAt
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'canceledAt'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `canceledAt` datetime NULL',
  'SELECT ''pro_subscriptions.canceledAt already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B5) pro_subscriptions.lastPaymentId
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'lastPaymentId'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `lastPaymentId` varchar(36) NULL',
  'SELECT ''pro_subscriptions.lastPaymentId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B5b) pro_subscriptions: บัตรของแถว + renewalFailedAt
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'cardBrand'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `cardBrand` varchar(30) NULL',
  'SELECT ''pro_subscriptions.cardBrand already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'cardLastDigits'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `cardLastDigits` varchar(4) NULL',
  'SELECT ''pro_subscriptions.cardLastDigits already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'omiseCardId'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `omiseCardId` varchar(64) NULL',
  'SELECT ''pro_subscriptions.omiseCardId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND COLUMN_NAME = 'renewalFailedAt'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD COLUMN `renewalFailedAt` datetime NULL',
  'SELECT ''pro_subscriptions.renewalFailedAt already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B6) index pro_subscriptions(omiseScheduleId)
SET @lumo_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_subscriptions'
    AND INDEX_NAME = 'IDX_pro_subscriptions_schedule'
);
SET @lumo_ddl := IF(
  @lumo_idx_exists = 0,
  'ALTER TABLE `pro_subscriptions` ADD KEY `IDX_pro_subscriptions_schedule` (`omiseScheduleId`)',
  'SELECT ''IDX_pro_subscriptions_schedule already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B7) pro_page.vatEnabled
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_page'
    AND COLUMN_NAME = 'vatEnabled'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_page` ADD COLUMN `vatEnabled` tinyint NOT NULL DEFAULT 0',
  'SELECT ''pro_page.vatEnabled already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: 2 ตารางใหม่ (collation ต้องตรงกับ pro_plans), column ใหม่ 9 แถว
SELECT t.TABLE_NAME, t.TABLE_COLLATION,
  (SELECT e.TABLE_COLLATION FROM information_schema.TABLES e
   WHERE e.TABLE_SCHEMA = DATABASE() AND e.TABLE_NAME = 'pro_plans') AS pro_plans_collation
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN ('pro_customers', 'pro_payments')
ORDER BY t.TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'pro_subscriptions' AND COLUMN_NAME IN ('omiseScheduleId', 'canceledAt', 'lastPaymentId', 'cardBrand', 'cardLastDigits', 'omiseCardId', 'renewalFailedAt'))
    OR (TABLE_NAME = 'pro_page' AND COLUMN_NAME = 'vatEnabled')
    OR (TABLE_NAME = 'pro_payments' AND COLUMN_NAME = 'refundRequired'))
ORDER BY TABLE_NAME, COLUMN_NAME;
