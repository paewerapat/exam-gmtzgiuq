-- 20261113-01-pro-membership.sql
--
-- Task:    docs/dev-loop/17-pro-foundation.md (lumo3 งานที่ 3 ส่วน 1/2 สมาชิก Pro ส่วนฐาน)
-- Entity:  src/pro/pro-venue.entity.ts         -> pro_venues
--          src/pro/pro-plan.entity.ts          -> pro_plans
--          src/pro/pro-subscription.entity.ts  -> pro_subscriptions
--          src/pro/pro-page.entity.ts          -> pro_page
--          src/categories/category.entity.ts   -> categories.venueId
-- When:    **รันก่อน deploy API** (API ใหม่ SELECT categories.venueId และ JOIN pro_venues ในหน้า
--          Mock Exam ทุกหน้า ถ้าไม่มี column/ตาราง หน้า Mock Exam, หมวดหมู่ และ /pro/* จะ error 500)
--          ต้องรัน 20261105-02-mock-exam.sql และ 20261110-01-unlock-codes.sql มาก่อนแล้ว
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: สร้าง 4 ตารางใหม่ + เพิ่ม 1 column ใน categories + ใส่ข้อมูลตัวอย่าง
--   pro_venues          สนามสอบ (key ไม่ซ้ำ ใช้ใน URL /upgrade?venue=<key>), comparison = ตารางเปรียบเทียบ (json)
--   pro_plans           แพ็กเกจต่อสนาม (UNIQUE venueId+code), rank 0 = ฟรี, ราคาหน่วยสตางค์,
--                       entitlements = สิทธิ์จริง (json) แยกจากข้อความที่แสดง
--   pro_subscriptions   สิทธิ์ของผู้ใช้ (active / expired / revoked) 1 แถว active ต่อผู้ใช้ต่อสนาม
--                       (API ตรวจใน transaction ที่ lock แถว users) หมดอายุ = currentPeriodEnd <= now
--   pro_page            ข้อความหน้า Upgrade (แถวเดียว id = 1)
--   categories.venueId  varchar(36) NULL หมวดหมู่นี้อยู่สนามไหน (ว่าง = ไม่อยู่สนามใด ชุด Mock ที่ต้องซื้อยังล็อก)
--
-- FK มีเฉพาะระหว่างตารางใหม่: pro_plans -> pro_venues (ลบสนาม = ลบแพ็กเกจของสนาม),
--   pro_subscriptions -> pro_venues / pro_plans (NO ACTION: ลบสนาม/แพ็กเกจที่มีสมาชิกอ้างอิงไม่ได้)
-- ไม่มี FK ไป users/exams/categories (กัน errno 150 ถ้า collation ของตารางเดิมต่างจากตารางใหม่)
-- ตารางใหม่ไม่ระบุ charset จึงใช้ค่า default ของ database เหมือนตารางเดิมที่ TypeORM สร้าง
-- ต้องตรวจข้อ A3 ว่า Collation ตรงกับ exams/users/categories (ไม่ตรงจะ JOIN ไม่ได้
-- #1267 Illegal mix of collations) ถ้าไม่ตรงใช้ A4 (อัตโนมัติ ไม่ต้องแก้ค่า)
--
-- ข้อมูลตัวอย่าง (ราคา/ข้อความ/สิทธิ์เป็นค่าตัวอย่าง แอดมินแก้ได้ในหน้า /admin/pro):
--   - 5 สนาม NETSAT, A-Level, TGAT, TPAT, สอวน. พร้อมตารางเปรียบเทียบ
--     ใส่เฉพาะเมื่อ pro_venues ยังว่างทั้งตาราง (รันซ้ำไม่ซ้ำ และไม่ทับสนามที่แอดมินแก้แล้ว)
--   - แพ็กเกจ Free (0) / PRO (199 บาท) / MAX (299 บาท, แนะนำ) ของ 5 สนามตัวอย่าง
--     ใส่เฉพาะสนามตัวอย่างที่ยังไม่มีแพ็กเกจเลย (ถ้าแอดมินลบแพ็กเกจของสนามตัวอย่างหมดแล้วรันไฟล์นี้ซ้ำ
--     แพ็กเกจตัวอย่างจะกลับมา)
--   - ข้อความหน้า Upgrade แถว id = 1 ใส่เฉพาะเมื่อยังไม่มี
-- ไฟล์นี้มีภาษาไทย: mysql client ต้องใช้ --default-character-set=utf8mb4 (phpMyAdmin ใช้ utf8mb4 อยู่แล้ว)
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
-- CREATE TABLE IF NOT EXISTS รันซ้ำได้ (ตารางมีอยู่แล้ว = ได้ warning ไม่เสียหาย)
-- ALTER ... ADD COLUMN ถ้าได้ #1060 Duplicate column name = มี column แล้ว ไม่เสียหาย
--   (ALTER อยู่ท้าย A2 เพราะ error จะหยุดคำสั่งที่เหลือในชุดเดียวกัน)
--
-- A1) ตรวจก่อน: ต้องมี exams.isMock/accessType และตาราง exam_access แล้ว (ไม่มี = ยังไม่ได้รัน
--     20261105-02-mock-exam.sql / 20261110-01-unlock-codes.sql ให้รันไฟล์นั้นก่อน)
--     และดูว่ามีตาราง/column ของงานนี้แล้วหรือยัง
--
-- SHOW COLUMNS FROM `exams` WHERE Field IN ('isMock','accessType');
-- SHOW TABLES LIKE 'exam_access';
-- SHOW TABLES LIKE 'pro\_%';
-- SHOW COLUMNS FROM `categories` WHERE Field = 'venueId';
--
-- A2) สร้างตารางและเพิ่ม column (รันทั้ง 5 คำสั่งพร้อมกันได้ ลำดับสำคัญ: pro_venues ก่อน pro_plans
--     ก่อน pro_subscriptions เพราะมี FK)
--
-- CREATE TABLE IF NOT EXISTS `pro_venues` (
--   `id` varchar(36) NOT NULL,
--   `key` varchar(30) NOT NULL,
--   `name` varchar(100) NOT NULL,
--   `description` varchar(500) NULL,
--   `sortOrder` int NOT NULL DEFAULT 0,
--   `isActive` tinyint NOT NULL DEFAULT 1,
--   `comparison` json NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `UQ_pro_venues_key` (`key`)
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `pro_plans` (
--   `id` varchar(36) NOT NULL,
--   `venueId` varchar(36) NOT NULL,
--   `code` varchar(30) NOT NULL,
--   `rank` int NOT NULL DEFAULT 0,
--   `name` varchar(50) NOT NULL,
--   `tagline` varchar(150) NULL,
--   `priceSatang` int NOT NULL DEFAULT 0,
--   `priceUnit` varchar(30) NULL,
--   `priceNote` varchar(150) NULL,
--   `periodDays` int NOT NULL DEFAULT 30,
--   `buttonText` varchar(50) NOT NULL,
--   `badge` varchar(30) NULL,
--   `highlight` tinyint NOT NULL DEFAULT 0,
--   `sortOrder` int NOT NULL DEFAULT 0,
--   `isVisible` tinyint NOT NULL DEFAULT 1,
--   `isPurchasable` tinyint NOT NULL DEFAULT 0,
--   `entitlements` json NOT NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   UNIQUE KEY `UQ_pro_plans_venue_code` (`venueId`, `code`),
--   CONSTRAINT `FK_pro_plans_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `pro_subscriptions` (
--   `id` varchar(36) NOT NULL,
--   `userId` varchar(36) NOT NULL,
--   `venueId` varchar(36) NOT NULL,
--   `planId` varchar(36) NOT NULL,
--   `status` varchar(20) NOT NULL,
--   `source` varchar(20) NOT NULL,
--   `currentPeriodStart` datetime NOT NULL,
--   `currentPeriodEnd` datetime NOT NULL,
--   `autoRenew` tinyint NOT NULL DEFAULT 0,
--   `note` varchar(255) NULL,
--   `grantedById` varchar(36) NULL,
--   `revokedAt` datetime NULL,
--   `revokedById` varchar(36) NULL,
--   `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`),
--   KEY `IDX_pro_subscriptions_user_venue_status` (`userId`, `venueId`, `status`),
--   KEY `IDX_pro_subscriptions_status_end` (`status`, `currentPeriodEnd`),
--   KEY `IDX_pro_subscriptions_venueId` (`venueId`),
--   KEY `IDX_pro_subscriptions_planId` (`planId`),
--   CONSTRAINT `FK_pro_subscriptions_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
--   CONSTRAINT `FK_pro_subscriptions_plan` FOREIGN KEY (`planId`) REFERENCES `pro_plans` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
-- ) ENGINE=InnoDB;
--
-- CREATE TABLE IF NOT EXISTS `pro_page` (
--   `id` int NOT NULL,
--   `title` varchar(150) NOT NULL DEFAULT '',
--   `subtitle` varchar(500) NULL,
--   `venuePickerTitle` varchar(150) NULL,
--   `footerNote` varchar(500) NULL,
--   `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
--   PRIMARY KEY (`id`)
-- ) ENGINE=InnoDB;
--
-- ALTER TABLE `categories` ADD COLUMN `venueId` varchar(36) NULL;
--
-- A3) ตรวจผล
--     - SHOW TABLES ต้องได้ 4 ตาราง pro_page, pro_plans, pro_subscriptions, pro_venues
--
-- SHOW TABLES LIKE 'pro\_%';
--
--     - categories.venueId: Type varchar(36), Null YES, Default NULL
--
-- SHOW COLUMNS FROM `categories` WHERE Field = 'venueId';
--
--     - Collation: ดูคอลัมน์ "Collation" ของทุกแถว ต้องเหมือนกันทั้ง 7 แถว
--       (exams, users, categories และ 4 ตารางใหม่)
--
-- SHOW TABLE STATUS WHERE Name IN ('exams','users','categories','pro_venues','pro_plans','pro_subscriptions','pro_page');
--
--       เหมือนกันทั้งหมด = ไม่ต้องทำ A4 ไปทำ A5 ต่อ
--       ตารางใหม่ต่างจาก exams (เช่น exams = utf8mb4_general_ci หรือ utf8mb3_general_ci /
--       utf8_general_ci แต่ตารางใหม่ = utf8mb4_unicode_ci) = ทำ A4 ก่อน (ไม่งั้น API จะ error
--       #1267 Illegal mix of collations ตอน JOIN categories/users กับตารางใหม่)
--       ถ้า exams, users, categories ต่างกันเอง: หยุดและแจ้งทีม dev ก่อน deploy
--
-- A4) แก้ collation ของตารางใหม่ให้ตรงกับ exams (ทำเฉพาะเมื่อ A3 บอกว่าไม่ตรง)
--     คัดลอกทั้งบล็อก A4 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - อ่าน collation จาก exams.id เอง (ใช้ได้ทั้ง utf8mb4 และ utf8mb3/utf8)
--     - ลบแล้วสร้างตารางใหม่ทั้ง 4 ด้วย collation นั้น เฉพาะตอนที่ pro_subscriptions ยังไม่มีข้อมูล
--       (ก่อน deploy API; ข้อมูลตัวอย่างใน pro_venues/pro_plans/pro_page ถ้ารัน A5 ไปแล้วจะหายไป
--       ให้รัน A5 ใหม่หลัง A4) ถ้ามีสมาชิกแล้วจะไม่ทำอะไร แสดง "skipped" — กรณีนี้ให้แจ้งทีม dev
--     - ใช้ DROP + CREATE แทน ALTER ... CONVERT TO เพราะ CONVERT ตารางที่มี FK ระหว่างกัน
--       จะ error (#1832/#1833 หรือ errno 150/3780)
--     - categories.venueId ใช้ collation ของ categories อยู่แล้ว ไม่ต้องแก้
--     ผลแถวแรกจะแสดง collation ที่ใช้และ action ("recreate" หรือ "skipped: ...")
--     เสร็จแล้วรันคำสั่ง SHOW TABLE STATUS ของ A3 อีกครั้ง ต้องเหมือนกันทั้ง 7 แถว
--
-- -- A4 begin
-- SET @lumo_coll := (SELECT COLLATION(`id`) FROM `exams` LIMIT 1);
-- SET @lumo_rows := (SELECT COUNT(*) FROM `pro_subscriptions`);
-- SET @lumo_go := (@lumo_coll IS NOT NULL AND @lumo_rows = 0);
-- SELECT @lumo_coll AS exams_collation, @lumo_rows AS rows_in_pro_subscriptions, IF(@lumo_go, 'recreate', IF(@lumo_coll IS NULL, 'skipped: exams has no rows', 'skipped: pro_subscriptions already has data')) AS action;
-- SET FOREIGN_KEY_CHECKS = 0;
-- SET @lumo_ddl := IF(@lumo_go, 'DROP TABLE IF EXISTS `pro_subscriptions`, `pro_plans`, `pro_venues`, `pro_page`', 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_venues` (`id` varchar(36) NOT NULL, `key` varchar(30) NOT NULL, `name` varchar(100) NOT NULL, `description` varchar(500) NULL, `sortOrder` int NOT NULL DEFAULT 0, `isActive` tinyint NOT NULL DEFAULT 1, `comparison` json NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_pro_venues_key` (`key`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_plans` (`id` varchar(36) NOT NULL, `venueId` varchar(36) NOT NULL, `code` varchar(30) NOT NULL, `rank` int NOT NULL DEFAULT 0, `name` varchar(50) NOT NULL, `tagline` varchar(150) NULL, `priceSatang` int NOT NULL DEFAULT 0, `priceUnit` varchar(30) NULL, `priceNote` varchar(150) NULL, `periodDays` int NOT NULL DEFAULT 30, `buttonText` varchar(50) NOT NULL, `badge` varchar(30) NULL, `highlight` tinyint NOT NULL DEFAULT 0, `sortOrder` int NOT NULL DEFAULT 0, `isVisible` tinyint NOT NULL DEFAULT 1, `isPurchasable` tinyint NOT NULL DEFAULT 0, `entitlements` json NOT NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_pro_plans_venue_code` (`venueId`, `code`), CONSTRAINT `FK_pro_plans_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_subscriptions` (`id` varchar(36) NOT NULL, `userId` varchar(36) NOT NULL, `venueId` varchar(36) NOT NULL, `planId` varchar(36) NOT NULL, `status` varchar(20) NOT NULL, `source` varchar(20) NOT NULL, `currentPeriodStart` datetime NOT NULL, `currentPeriodEnd` datetime NOT NULL, `autoRenew` tinyint NOT NULL DEFAULT 0, `note` varchar(255) NULL, `grantedById` varchar(36) NULL, `revokedAt` datetime NULL, `revokedById` varchar(36) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), KEY `IDX_pro_subscriptions_user_venue_status` (`userId`, `venueId`, `status`), KEY `IDX_pro_subscriptions_status_end` (`status`, `currentPeriodEnd`), KEY `IDX_pro_subscriptions_venueId` (`venueId`), KEY `IDX_pro_subscriptions_planId` (`planId`), CONSTRAINT `FK_pro_subscriptions_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT `FK_pro_subscriptions_plan` FOREIGN KEY (`planId`) REFERENCES `pro_plans` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := IF(@lumo_go, CONCAT('CREATE TABLE `pro_page` (`id` int NOT NULL, `title` varchar(150) NOT NULL DEFAULT '''', `subtitle` varchar(500) NULL, `venuePickerTitle` varchar(150) NULL, `footerNote` varchar(500) NULL, `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`)) ENGINE=InnoDB COLLATE=', @lumo_coll), 'SELECT ''skipped'' AS info');
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET FOREIGN_KEY_CHECKS = 1;
-- -- A4 end
--
-- A5) ใส่ข้อมูลตัวอย่าง (สนาม 5 / แพ็กเกจ 15 / ข้อความหน้า) คัดลอกทั้งบล็อก A5 ไปรันครั้งเดียว
--     (มีตัวแปร @lumo_cmp ต้องอยู่ในการรันครั้งเดียวกับ INSERT) รันซ้ำได้ ไม่ใส่ซ้ำ
--
-- -- A5 begin
-- SET @lumo_cmp := '{"groups":[{"title":"PREDICTED EXAM","rows":[{"label":"ข้อสอบจำลองตามแนวข้อสอบรอบหน้า (__VENUE__)","sublabel":"__SUBJECTS__","cells":{"free":{"type":"text","text":"Preview","subtext":"ทุกวิชา"},"pro":{"type":"text","text":"2 ชุด","subtext":"ต่อ 1 วิชา"},"max":{"type":"text","text":"6 ชุด","subtext":"ต่อ 1 วิชา"}}},{"label":"ชุดยาก (ยากกว่าข้อสอบจริง)","sublabel":"ประกอบจากข้อ Challenge","cells":{"free":{"type":"cross"},"pro":{"type":"cross"},"max":{"type":"text","text":"+2 ชุดยาก","subtext":"ต่อ 1 วิชา"}}},{"label":"เฉลยพร้อมวิธีทำ","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}}]},{"title":"QUESTION BANK","rows":[{"label":"โจทย์ระดับ Easy / Medium / Hard","cells":{"free":{"type":"check"},"pro":{"type":"check"},"max":{"type":"check"}}},{"label":"ข้อ Challenge","sublabel":"ข้อที่ยากที่สุดในระดับข้อสอบจริง","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}},{"label":"ข้อ Beyond","sublabel":"ยากกว่าข้อสอบจริง สำหรับคนที่อยากเกินร้อย","cells":{"free":{"type":"cross"},"pro":{"type":"cross"},"max":{"type":"check"}}},{"label":"เลือกฝึกตามบท / ตั้งตัวกรอง","cells":{"free":{"type":"check"},"pro":{"type":"check"},"max":{"type":"check"}}}]},{"title":"ANALYTICS","rows":[{"label":"รายงานรอบล่าสุด","sublabel":"ข้อไหนซ้ำแนวเดิม ข้อไหนใหม่ ควรดูชุดไหนก่อน","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}},{"label":"แนวโน้มบทที่ออกในแต่ละรอบ","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}}]}]}';
-- SET @lumo_desc := 'สมัครแล้วใช้ได้เฉพาะ Challenge, Predicted Exam และ Analytics ของ __VENUE__';
-- INSERT INTO `pro_venues` (`id`, `key`, `name`, `description`, `sortOrder`, `isActive`, `comparison`)
-- SELECT s.id, s.vkey, s.vname, REPLACE(@lumo_desc, '__VENUE__', s.vname), s.sortOrder, 1,
--        REPLACE(REPLACE(@lumo_cmp, '__VENUE__', s.vname), '__SUBJECTS__', s.subjects)
-- FROM (
--   SELECT 'a17e0000-0000-4000-8000-000000000001' AS id, 'netsat' AS vkey, 'NETSAT' AS vname, 1 AS sortOrder, 'รวม 4 วิชา: คณิต ฟิสิกส์ เคมี ชีวะ' AS subjects
--   UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000002' AS id, 'alevel' AS vkey, 'A-Level' AS vname, 2 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
--   UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000003' AS id, 'tgat' AS vkey, 'TGAT' AS vname, 3 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
--   UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000004' AS id, 'tpat' AS vkey, 'TPAT' AS vname, 4 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
--   UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000005' AS id, 'posn' AS vkey, 'สอวน.' AS vname, 5 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
-- ) s
-- WHERE NOT EXISTS (SELECT 1 FROM `pro_venues`);
--
-- INSERT INTO `pro_plans` (`id`, `venueId`, `code`, `rank`, `name`, `tagline`, `priceSatang`, `priceUnit`, `priceNote`, `periodDays`, `buttonText`, `badge`, `highlight`, `sortOrder`, `isVisible`, `isPurchasable`, `entitlements`)
-- SELECT CONCAT('a17e0001-0000-4000-8000-0000000000', RIGHT(v.id, 1), p.pn), v.id, p.code, p.prank, p.pname, p.tagline, p.priceSatang, p.priceUnit, p.priceNote, 30, p.buttonText, p.badge, p.highlight, p.sortOrder, 1, p.isPurchasable, p.entitlements
-- FROM `pro_venues` v
-- CROSS JOIN (
--   SELECT '1' AS pn, 'free' AS code, 0 AS prank, 'Free' AS pname, 'เริ่มต้นทดลองใช้' AS tagline, 0 AS priceSatang, NULL AS priceUnit, NULL AS priceNote, 'เริ่มใช้งาน' AS buttonText, NULL AS badge, 0 AS highlight, 1 AS sortOrder, 0 AS isPurchasable, '{"challenge":false,"beyond":false,"predictedSets":0,"solutions":false,"analytics":false,"mockPurchase":false}' AS entitlements
--   UNION ALL SELECT '2' AS pn, 'pro' AS code, 1 AS prank, 'PRO' AS pname, 'ฝึกต่อเนื่อง ไม่ทุ่มงบมาก' AS tagline, 19900 AS priceSatang, '/ เดือน' AS priceUnit, 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้' AS priceNote, 'สมัคร PRO' AS buttonText, NULL AS badge, 0 AS highlight, 2 AS sortOrder, 1 AS isPurchasable, '{"challenge":true,"beyond":false,"predictedSets":2,"solutions":true,"analytics":true,"mockPurchase":true}' AS entitlements
--   UNION ALL SELECT '3' AS pn, 'max' AS code, 2 AS prank, 'MAX' AS pname, 'ครบทุกอย่าง ฝึกหนักกว่าข้อสอบจริง' AS tagline, 29900 AS priceSatang, '/ เดือน' AS priceUnit, 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้' AS priceNote, 'สมัคร MAX' AS buttonText, 'แนะนำ' AS badge, 1 AS highlight, 3 AS sortOrder, 1 AS isPurchasable, '{"challenge":true,"beyond":true,"predictedSets":6,"solutions":true,"analytics":true,"mockPurchase":true}' AS entitlements
-- ) p
-- WHERE v.id IN ('a17e0000-0000-4000-8000-000000000001', 'a17e0000-0000-4000-8000-000000000002', 'a17e0000-0000-4000-8000-000000000003', 'a17e0000-0000-4000-8000-000000000004', 'a17e0000-0000-4000-8000-000000000005')
--   AND NOT EXISTS (SELECT 1 FROM `pro_plans` x WHERE x.venueId = v.id);
--
-- INSERT INTO `pro_page` (`id`, `title`, `subtitle`, `venuePickerTitle`, `footerNote`)
-- SELECT 1, 'แพ็กเกจ LUMO', 'เลือกแพ็กเกจที่เหมาะกับการเตรียมสอบของคุณ', 'เลือกสนามที่จะสมัคร', 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้'
-- FROM DUAL
-- WHERE NOT EXISTS (SELECT 1 FROM `pro_page` WHERE `id` = 1);
-- -- A5 end
--
-- A6) ตรวจข้อมูลตัวอย่าง: ต้องได้ venues = 5, plans = 15, page = 1, subscriptions = 0
--     (ถ้าแอดมินแก้/เพิ่มก่อนหน้านี้แล้วจำนวนอาจต่างได้)
--
-- SELECT (SELECT COUNT(*) FROM `pro_venues`) AS venues, (SELECT COUNT(*) FROM `pro_plans`) AS plans, (SELECT COUNT(*) FROM `pro_page`) AS page, (SELECT COUNT(*) FROM `pro_subscriptions`) AS subscriptions;
-- SELECT v.`key`, v.`name`, p.`code`, p.`rank`, p.`priceSatang`, p.`isPurchasable` FROM `pro_plans` p JOIN `pro_venues` v ON v.`id` = p.`venueId` ORDER BY v.`sortOrder`, p.`sortOrder`;
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (CREATE TABLE IF NOT EXISTS; column ใหม่ตรวจ information_schema ก่อนแล้ว ALTER ผ่าน
--  prepared statement ไม่ใช้ ADD COLUMN IF NOT EXISTS ซึ่ง MySQL ไม่รองรับ;
--  ข้อมูลตัวอย่างใส่ด้วย INSERT ... SELECT ... WHERE NOT EXISTS)

-- B1) pro_venues
CREATE TABLE IF NOT EXISTS `pro_venues` (
  `id` varchar(36) NOT NULL,
  `key` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(500) NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `comparison` json NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_pro_venues_key` (`key`)
) ENGINE=InnoDB;

-- B2) pro_plans
CREATE TABLE IF NOT EXISTS `pro_plans` (
  `id` varchar(36) NOT NULL,
  `venueId` varchar(36) NOT NULL,
  `code` varchar(30) NOT NULL,
  `rank` int NOT NULL DEFAULT 0,
  `name` varchar(50) NOT NULL,
  `tagline` varchar(150) NULL,
  `priceSatang` int NOT NULL DEFAULT 0,
  `priceUnit` varchar(30) NULL,
  `priceNote` varchar(150) NULL,
  `periodDays` int NOT NULL DEFAULT 30,
  `buttonText` varchar(50) NOT NULL,
  `badge` varchar(30) NULL,
  `highlight` tinyint NOT NULL DEFAULT 0,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isVisible` tinyint NOT NULL DEFAULT 1,
  `isPurchasable` tinyint NOT NULL DEFAULT 0,
  `entitlements` json NOT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_pro_plans_venue_code` (`venueId`, `code`),
  CONSTRAINT `FK_pro_plans_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB;

-- B3) pro_subscriptions
CREATE TABLE IF NOT EXISTS `pro_subscriptions` (
  `id` varchar(36) NOT NULL,
  `userId` varchar(36) NOT NULL,
  `venueId` varchar(36) NOT NULL,
  `planId` varchar(36) NOT NULL,
  `status` varchar(20) NOT NULL,
  `source` varchar(20) NOT NULL,
  `currentPeriodStart` datetime NOT NULL,
  `currentPeriodEnd` datetime NOT NULL,
  `autoRenew` tinyint NOT NULL DEFAULT 0,
  `note` varchar(255) NULL,
  `grantedById` varchar(36) NULL,
  `revokedAt` datetime NULL,
  `revokedById` varchar(36) NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `IDX_pro_subscriptions_user_venue_status` (`userId`, `venueId`, `status`),
  KEY `IDX_pro_subscriptions_status_end` (`status`, `currentPeriodEnd`),
  KEY `IDX_pro_subscriptions_venueId` (`venueId`),
  KEY `IDX_pro_subscriptions_planId` (`planId`),
  CONSTRAINT `FK_pro_subscriptions_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT `FK_pro_subscriptions_plan` FOREIGN KEY (`planId`) REFERENCES `pro_plans` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION
) ENGINE=InnoDB;

-- B4) pro_page
CREATE TABLE IF NOT EXISTS `pro_page` (
  `id` int NOT NULL,
  `title` varchar(150) NOT NULL DEFAULT '',
  `subtitle` varchar(500) NULL,
  `venuePickerTitle` varchar(150) NULL,
  `footerNote` varchar(500) NULL,
  `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB;

-- B5) categories.venueId
SET @lumo_col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories'
    AND COLUMN_NAME = 'venueId'
);
SET @lumo_ddl := IF(
  @lumo_col_exists = 0,
  'ALTER TABLE `categories` ADD COLUMN `venueId` varchar(36) NULL',
  'SELECT ''categories.venueId already exists - skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B6) ข้อมูลตัวอย่าง: สนาม (เฉพาะเมื่อ pro_venues ว่าง)
SET @lumo_cmp := '{"groups":[{"title":"PREDICTED EXAM","rows":[{"label":"ข้อสอบจำลองตามแนวข้อสอบรอบหน้า (__VENUE__)","sublabel":"__SUBJECTS__","cells":{"free":{"type":"text","text":"Preview","subtext":"ทุกวิชา"},"pro":{"type":"text","text":"2 ชุด","subtext":"ต่อ 1 วิชา"},"max":{"type":"text","text":"6 ชุด","subtext":"ต่อ 1 วิชา"}}},{"label":"ชุดยาก (ยากกว่าข้อสอบจริง)","sublabel":"ประกอบจากข้อ Challenge","cells":{"free":{"type":"cross"},"pro":{"type":"cross"},"max":{"type":"text","text":"+2 ชุดยาก","subtext":"ต่อ 1 วิชา"}}},{"label":"เฉลยพร้อมวิธีทำ","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}}]},{"title":"QUESTION BANK","rows":[{"label":"โจทย์ระดับ Easy / Medium / Hard","cells":{"free":{"type":"check"},"pro":{"type":"check"},"max":{"type":"check"}}},{"label":"ข้อ Challenge","sublabel":"ข้อที่ยากที่สุดในระดับข้อสอบจริง","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}},{"label":"ข้อ Beyond","sublabel":"ยากกว่าข้อสอบจริง สำหรับคนที่อยากเกินร้อย","cells":{"free":{"type":"cross"},"pro":{"type":"cross"},"max":{"type":"check"}}},{"label":"เลือกฝึกตามบท / ตั้งตัวกรอง","cells":{"free":{"type":"check"},"pro":{"type":"check"},"max":{"type":"check"}}}]},{"title":"ANALYTICS","rows":[{"label":"รายงานรอบล่าสุด","sublabel":"ข้อไหนซ้ำแนวเดิม ข้อไหนใหม่ ควรดูชุดไหนก่อน","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}},{"label":"แนวโน้มบทที่ออกในแต่ละรอบ","cells":{"free":{"type":"cross"},"pro":{"type":"check"},"max":{"type":"check"}}}]}]}';
SET @lumo_desc := 'สมัครแล้วใช้ได้เฉพาะ Challenge, Predicted Exam และ Analytics ของ __VENUE__';
INSERT INTO `pro_venues` (`id`, `key`, `name`, `description`, `sortOrder`, `isActive`, `comparison`)
SELECT s.id, s.vkey, s.vname, REPLACE(@lumo_desc, '__VENUE__', s.vname), s.sortOrder, 1,
       REPLACE(REPLACE(@lumo_cmp, '__VENUE__', s.vname), '__SUBJECTS__', s.subjects)
FROM (
  SELECT 'a17e0000-0000-4000-8000-000000000001' AS id, 'netsat' AS vkey, 'NETSAT' AS vname, 1 AS sortOrder, 'รวม 4 วิชา: คณิต ฟิสิกส์ เคมี ชีวะ' AS subjects
  UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000002' AS id, 'alevel' AS vkey, 'A-Level' AS vname, 2 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
  UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000003' AS id, 'tgat' AS vkey, 'TGAT' AS vname, 3 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
  UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000004' AS id, 'tpat' AS vkey, 'TPAT' AS vname, 4 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
  UNION ALL SELECT 'a17e0000-0000-4000-8000-000000000005' AS id, 'posn' AS vkey, 'สอวน.' AS vname, 5 AS sortOrder, 'ทุกวิชาของสนามนี้' AS subjects
) s
WHERE NOT EXISTS (SELECT 1 FROM `pro_venues`);

-- B7) ข้อมูลตัวอย่าง: แพ็กเกจ (เฉพาะสนามตัวอย่างที่ยังไม่มีแพ็กเกจ)
INSERT INTO `pro_plans` (`id`, `venueId`, `code`, `rank`, `name`, `tagline`, `priceSatang`, `priceUnit`, `priceNote`, `periodDays`, `buttonText`, `badge`, `highlight`, `sortOrder`, `isVisible`, `isPurchasable`, `entitlements`)
SELECT CONCAT('a17e0001-0000-4000-8000-0000000000', RIGHT(v.id, 1), p.pn), v.id, p.code, p.prank, p.pname, p.tagline, p.priceSatang, p.priceUnit, p.priceNote, 30, p.buttonText, p.badge, p.highlight, p.sortOrder, 1, p.isPurchasable, p.entitlements
FROM `pro_venues` v
CROSS JOIN (
  SELECT '1' AS pn, 'free' AS code, 0 AS prank, 'Free' AS pname, 'เริ่มต้นทดลองใช้' AS tagline, 0 AS priceSatang, NULL AS priceUnit, NULL AS priceNote, 'เริ่มใช้งาน' AS buttonText, NULL AS badge, 0 AS highlight, 1 AS sortOrder, 0 AS isPurchasable, '{"challenge":false,"beyond":false,"predictedSets":0,"solutions":false,"analytics":false,"mockPurchase":false}' AS entitlements
  UNION ALL SELECT '2' AS pn, 'pro' AS code, 1 AS prank, 'PRO' AS pname, 'ฝึกต่อเนื่อง ไม่ทุ่มงบมาก' AS tagline, 19900 AS priceSatang, '/ เดือน' AS priceUnit, 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้' AS priceNote, 'สมัคร PRO' AS buttonText, NULL AS badge, 0 AS highlight, 2 AS sortOrder, 1 AS isPurchasable, '{"challenge":true,"beyond":false,"predictedSets":2,"solutions":true,"analytics":true,"mockPurchase":true}' AS entitlements
  UNION ALL SELECT '3' AS pn, 'max' AS code, 2 AS prank, 'MAX' AS pname, 'ครบทุกอย่าง ฝึกหนักกว่าข้อสอบจริง' AS tagline, 29900 AS priceSatang, '/ เดือน' AS priceUnit, 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้' AS priceNote, 'สมัคร MAX' AS buttonText, 'แนะนำ' AS badge, 1 AS highlight, 3 AS sortOrder, 1 AS isPurchasable, '{"challenge":true,"beyond":true,"predictedSets":6,"solutions":true,"analytics":true,"mockPurchase":true}' AS entitlements
) p
WHERE v.id IN ('a17e0000-0000-4000-8000-000000000001', 'a17e0000-0000-4000-8000-000000000002', 'a17e0000-0000-4000-8000-000000000003', 'a17e0000-0000-4000-8000-000000000004', 'a17e0000-0000-4000-8000-000000000005')
  AND NOT EXISTS (SELECT 1 FROM `pro_plans` x WHERE x.venueId = v.id);

-- B8) ข้อมูลตัวอย่าง: ข้อความหน้า Upgrade (เฉพาะเมื่อยังไม่มีแถว id = 1)
INSERT INTO `pro_page` (`id`, `title`, `subtitle`, `venuePickerTitle`, `footerNote`)
SELECT 1, 'แพ็กเกจ LUMO', 'เลือกแพ็กเกจที่เหมาะกับการเตรียมสอบของคุณ', 'เลือกสนามที่จะสมัคร', 'ราคาต่อเดือน · ยกเลิกเมื่อไรก็ได้'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `pro_page` WHERE `id` = 1);

-- ตรวจผล: 4 ตาราง (collation ต้องตรงกับ exams), column ใหม่ 1 แถว, จำนวนข้อมูลตัวอย่าง
SELECT t.TABLE_NAME, t.TABLE_COLLATION,
  (SELECT e.TABLE_COLLATION FROM information_schema.TABLES e
   WHERE e.TABLE_SCHEMA = DATABASE() AND e.TABLE_NAME = 'exams') AS exams_collation
FROM information_schema.TABLES t
WHERE t.TABLE_SCHEMA = DATABASE()
  AND t.TABLE_NAME IN ('pro_venues', 'pro_plans', 'pro_subscriptions', 'pro_page')
ORDER BY t.TABLE_NAME;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'venueId';

SELECT (SELECT COUNT(*) FROM `pro_venues`) AS venues,
       (SELECT COUNT(*) FROM `pro_plans`) AS plans,
       (SELECT COUNT(*) FROM `pro_page`) AS page,
       (SELECT COUNT(*) FROM `pro_subscriptions`) AS subscriptions;
