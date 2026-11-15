-- 20261119-01-payments-open.sql
--
-- Task:    docs/dev-loop/23-payments-coming-soon.md (ปิดรับชำระเงินชั่วคราว "เร็ว ๆ นี้" ด้วยสวิตช์ในหลังบ้าน)
-- Entity:  src/pro/pro-page.entity.ts -> pro_page + paymentsOpen
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT pro_page.paymentsOpen ทุกครั้งที่เปิด /pro/upgrade, /pro/me,
--          หน้าแอดมิน Pro และตอนชำระเงิน ถ้าไม่มี column จะ error 500)
--          ต้องรัน 20261113-01-pro-membership.sql (ตาราง pro_page) มาก่อนแล้ว
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: เพิ่ม 1 column
--   pro_page.paymentsOpen tinyint NOT NULL DEFAULT 0
--     0 = ปิดรับชำระเงิน: ผู้ใช้ทั่วไปเห็น "เร็ว ๆ นี้" และชำระ/เปลี่ยนบัตรไม่ได้ (403 PAYMENTS_NOT_OPEN)
--         แอดมิน (users.role = 'admin') ยังทดสอบชำระได้
--     1 = เปิดรับชำระเงินตามปกติ
--   ค่าเริ่มต้น 0 → หลังรันไฟล์นี้ production เป็น "เร็ว ๆ นี้" ทันที (เมื่อ deploy API ใหม่แล้ว)
--   เปิดเองที่หลังบ้าน (สวิตช์ "เปิดรับชำระเงิน") เมื่อใส่ live key ของ Opn แล้ว
--   webhook, รอบตัดบัตรอัตโนมัติที่มีอยู่, ยกเลิกต่ออายุ, แอดมินให้สิทธิ์ และโค้ด Unlock ยังทำงานตามปกติ
-- column เป็นตัวเลข (boolean) ไม่มีเรื่อง charset/collation
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
--
-- A1) ตรวจก่อน: ต้องได้ตาราง pro_page 1 แถว (ไม่มี = ให้รัน 20261113-01-pro-membership.sql ก่อน)
--     และดูว่ามี column แล้วหรือยัง (0 แถว = ยังไม่มี -> ทำ A2 / 1 แถว = มีแล้ว ข้ามไป A3)
--
-- SHOW TABLES LIKE 'pro\_page';
-- SHOW COLUMNS FROM `pro_page` WHERE Field = 'paymentsOpen';
--
-- A2) เพิ่ม column (รันครั้งเดียว)
--
-- ALTER TABLE `pro_page` ADD COLUMN `paymentsOpen` tinyint NOT NULL DEFAULT 0;
--
--     ถ้าได้ #1060 Duplicate column name 'paymentsOpen' = มี column แล้ว ไม่เสียหาย ข้ามไป A3
--
-- A3) ตรวจผล: ต้องได้ 1 แถว Type tinyint (หรือ tinyint(4)), Null NO, Default 0
--
-- SHOW COLUMNS FROM `pro_page` WHERE Field = 'paymentsOpen';
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS
--  ซึ่ง MySQL ไม่รองรับ)

-- B1) pro_page.paymentsOpen
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_page'
    AND COLUMN_NAME = 'paymentsOpen'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `pro_page` ADD COLUMN `paymentsOpen` tinyint NOT NULL DEFAULT 0',
  'SELECT ''pro_page.paymentsOpen already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B2) ตรวจผล: ต้องได้ 1 แถว tinyint, IS_NULLABLE NO, COLUMN_DEFAULT 0
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'pro_page' AND COLUMN_NAME = 'paymentsOpen';
