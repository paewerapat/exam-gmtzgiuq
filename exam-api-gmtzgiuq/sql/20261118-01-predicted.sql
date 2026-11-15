-- 20261118-01-predicted.sql
--
-- Task:    docs/dev-loop/22-predicted-exam.md (lumo3 งานที่ 8: Predicted Exam)
-- Entity:  src/predicted/predicted-series.entity.ts -> predicted_series
--          src/predicted/predicted-set.entity.ts    -> predicted_sets
-- When:    **รันก่อน deploy API** (API ใหม่อ่าน predicted_sets ทุกครั้งที่เปิดรายการชุดข้อสอบ, ฝึกตามบท,
--          Question Bank, หน้าทำข้อสอบ และเริ่ม/ส่งข้อสอบ ถ้าไม่มีตารางจะ error 500 ทั้งเว็บ)
--          ต้องรัน 20261113-01-pro-membership.sql (ตาราง pro_venues) มาก่อนแล้ว
--
-- ไม่ลบ/ไม่แก้ข้อมูลเดิม: สร้าง 2 ตารางใหม่ (ว่าง) — ทุกหน้าทำงานเหมือนเดิมจนกว่าแอดมินจะสร้างซีรีส์
--   predicted_series  ซีรีส์ของชุด Predicted (เช่น "NETSAT MATH JAN PREDICTED") ต่อสนาม (+ วิชา ถ้ามี)
--                     venueId   -> pro_venues.id  ON DELETE RESTRICT (ลบสนามที่มีซีรีส์ไม่ได้ ได้ 409 จากหน้า /admin/pro)
--                     subjectId -> subjects.id    ON DELETE SET NULL (ลบวิชา = ซีรีส์ไม่มีวิชา)
--                     index (venueId, isActive, sortOrder), index (subjectId)
--   predicted_sets    ชุดข้อสอบในซีรีส์ (ชุดที่ 1..N) พร้อมสิทธิ์ free/pro และจำนวนข้อ Preview
--                     seriesId -> predicted_series.id ON DELETE CASCADE (ลบซีรีส์ = ชุดกลับเป็นชุดปกติ)
--                     examId   -> exams.id            ON DELETE CASCADE (ลบชุดข้อสอบ = ออกจากซีรีส์)
--                     UNIQUE (examId) ชุดหนึ่งอยู่ได้ซีรีส์เดียว, UNIQUE (seriesId, setNo)
--                     previewCount NULL หรือ 0 = ไม่มี Preview
--
-- Collation: FK ต้องมี charset/collation ตรงกับ column ที่อ้างถึง ไม่งั้นสร้างตารางไม่ได้ (errno 150 /
--   #1005 / #3780) production เป็น utf8mb3_general_ci ส่วน lumo_dev เป็น utf8mb4_unicode_ci ไฟล์นี้จึง
--   อ่าน charset/collation จากตารางเดิมเองแล้วสร้างตารางด้วยค่านั้น (ไม่ต้องแก้ค่าในไฟล์):
--   - ตารางทั้งสอง (รวม id, seriesId และ column ข้อความ) ใช้ของ exams.id
--   - predicted_series.venueId ใช้ของ pro_venues.id, predicted_series.subjectId ใช้ของ subjects.id
--   - predicted_sets.examId ใช้ของ exams.id
-- ไฟล์นี้มีภาษาไทยเฉพาะใน comment (mysql client ใช้ --default-character-set=utf8mb4 ได้ตามปกติ)
--
-- ============================================================================
-- ส่วน A: รันบน phpMyAdmin ของ Plesk (production, MariaDB)
-- ============================================================================
-- phpMyAdmin ของ production อ่าน information_schema ไม่ได้ (#1044) จึงใช้ส่วน B ไม่ได้
-- ให้คัดลอกคำสั่งด้านล่าง (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ตามลำดับ
--
-- A1) ตรวจก่อน: ต้องได้ตาราง pro_venues 1 แถว (ไม่มี = ให้รัน 20261113-01-pro-membership.sql ก่อน)
--     และดูว่ามีตารางของงานนี้แล้วหรือยัง (0 แถว = ยังไม่มี -> ทำ A2 / 2 แถว = มีแล้ว ข้ามไป A3)
--
-- SHOW TABLES LIKE 'pro\_venues';
-- SHOW TABLES LIKE 'predicted\_%';
--
-- A2) สร้างตาราง: คัดลอกทั้งบล็อก A2 (ลบ "-- " นำหน้า) ไปรันในแท็บ SQL ครั้งเดียว ไม่ต้องแก้อะไร
--     - แถวแรกของผลแสดง charset/collation ที่อ่านได้จาก exams.id, subjects.id, pro_venues.id
--       อ่านจากนิยามของคอลัมน์ (CHARSET()/COLLATION() ของคอลัมน์ผ่าน LEFT JOIN ที่ไม่มีแถว) ไม่ขึ้นกับข้อมูล:
--       ตารางว่างก็ได้ค่าจริงของคอลัมน์ ไม่ fallback ไปค่า default ของ database
--       (phpMyAdmin ของ production อ่าน information_schema ไม่ได้ จึงใช้วิธีนี้แทนส่วน B)
--     - CREATE TABLE IF NOT EXISTS: รันซ้ำได้ ถ้ามีตารางแล้วจะได้ Note 1050 แทน error ไม่เสียหาย
--     - ลำดับสำคัญ: predicted_series ก่อน predicted_sets (มี FK)
--
-- -- A2 begin
-- SET @lumo_exam_cs := (SELECT CHARSET(t.`id`) FROM (SELECT 1 AS x) d LEFT JOIN `exams` t ON 1 = 0);
-- SET @lumo_exam_coll := (SELECT COLLATION(t.`id`) FROM (SELECT 1 AS x) d LEFT JOIN `exams` t ON 1 = 0);
-- SET @lumo_subj_cs := (SELECT CHARSET(t.`id`) FROM (SELECT 1 AS x) d LEFT JOIN `subjects` t ON 1 = 0);
-- SET @lumo_subj_coll := (SELECT COLLATION(t.`id`) FROM (SELECT 1 AS x) d LEFT JOIN `subjects` t ON 1 = 0);
-- SET @lumo_venue_cs := (SELECT CHARSET(t.`id`) FROM (SELECT 1 AS x) d LEFT JOIN `pro_venues` t ON 1 = 0);
-- SET @lumo_venue_coll := (SELECT COLLATION(t.`id`) FROM (SELECT 1 AS x) d LEFT JOIN `pro_venues` t ON 1 = 0);
-- SELECT @lumo_exam_cs AS exams_charset, @lumo_exam_coll AS exams_collation, @lumo_subj_coll AS subjects_collation, @lumo_venue_coll AS pro_venues_collation;
-- SET @lumo_ddl := CONCAT('CREATE TABLE IF NOT EXISTS `predicted_series` (`id` varchar(36) NOT NULL, `venueId` varchar(36) CHARACTER SET ', @lumo_venue_cs, ' COLLATE ', @lumo_venue_coll, ' NOT NULL, `subjectId` varchar(36) CHARACTER SET ', @lumo_subj_cs, ' COLLATE ', @lumo_subj_coll, ' NULL, `title` varchar(150) NOT NULL, `description` varchar(500) NULL, `color` varchar(7) NULL, `sortOrder` int NOT NULL DEFAULT 0, `isActive` tinyint NOT NULL DEFAULT 1, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), KEY `IDX_predicted_series_venue_active_sort` (`venueId`, `isActive`, `sortOrder`), KEY `IDX_predicted_series_subjectId` (`subjectId`), CONSTRAINT `FK_predicted_series_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION, CONSTRAINT `FK_predicted_series_subject` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION) ENGINE=InnoDB DEFAULT CHARSET=', @lumo_exam_cs, ' COLLATE=', @lumo_exam_coll);
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- SET @lumo_ddl := CONCAT('CREATE TABLE IF NOT EXISTS `predicted_sets` (`id` varchar(36) NOT NULL, `seriesId` varchar(36) NOT NULL, `examId` varchar(36) CHARACTER SET ', @lumo_exam_cs, ' COLLATE ', @lumo_exam_coll, ' NOT NULL, `setNo` int NOT NULL, `access` enum(''free'',''pro'') NOT NULL DEFAULT ''pro'', `previewCount` int NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (`id`), UNIQUE KEY `UQ_predicted_sets_examId` (`examId`), UNIQUE KEY `UQ_predicted_sets_series_setNo` (`seriesId`, `setNo`), CONSTRAINT `FK_predicted_sets_series` FOREIGN KEY (`seriesId`) REFERENCES `predicted_series` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT `FK_predicted_sets_exam` FOREIGN KEY (`examId`) REFERENCES `exams` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION) ENGINE=InnoDB DEFAULT CHARSET=', @lumo_exam_cs, ' COLLATE=', @lumo_exam_coll);
-- PREPARE lumo_stmt FROM @lumo_ddl; EXECUTE lumo_stmt; DEALLOCATE PREPARE lumo_stmt;
-- -- A2 end
--
--     ถ้าได้ #1146 (ไม่มีตาราง) = ยังไม่ได้รัน SQL ของตาราง exams / subjects / pro_venues
--     ถ้าได้ #1005 / errno 150 / #3780 (FK สร้างไม่ได้) = collation ที่อ่านได้ต่างจาก column จริง
--     (ไม่ควรเกิด): หยุดและแจ้งทีม dev พร้อมผลแถวแรกของ A2 และผลของ A3 (ข้อ Collation)
--
-- A3) ตรวจผล
--     - ต้องได้ 2 ตาราง predicted_series, predicted_sets
--
-- SHOW TABLES LIKE 'predicted\_%';
--
--     - Collation: คอลัมน์ "Collation" ของแถวที่จับคู่กันต้องเหมือนกัน
--       predicted_series.venueId = pro_venues.id, predicted_series.subjectId = subjects.id,
--       predicted_sets.examId = exams.id, predicted_sets.seriesId = predicted_series.id
--
-- SHOW FULL COLUMNS FROM `predicted_series` WHERE Field IN ('id','venueId','subjectId');
-- SHOW FULL COLUMNS FROM `predicted_sets` WHERE Field IN ('seriesId','examId');
-- SHOW FULL COLUMNS FROM `pro_venues` WHERE Field = 'id';
-- SHOW FULL COLUMNS FROM `subjects` WHERE Field = 'id';
-- SHOW FULL COLUMNS FROM `exams` WHERE Field = 'id';
--
--     - FK 4 ตัว (FK_predicted_series_venue / _subject, FK_predicted_sets_series / _exam) และ index ครบ
--
-- SHOW CREATE TABLE `predicted_series`;
-- SHOW CREATE TABLE `predicted_sets`;
--
-- ============================================================================
-- ส่วน B: idempotent อัตโนมัติ (mysql client / DB ที่อ่าน information_schema ได้ เช่น lumo_dev)
-- ============================================================================
-- รันทั้งไฟล์ซ้ำได้ ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.2+
-- (อ่าน charset/collation จาก information_schema แล้ว CREATE TABLE IF NOT EXISTS ผ่าน prepared
--  statement; ตารางมีอยู่แล้ว = ข้าม ไม่แตะข้อมูล)

-- B0) charset/collation ของ column ที่ FK อ้างถึง (ไม่มีข้อมูลก็อ่านได้)
SET @lumo_exam_cs := (
  SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'id'
);
SET @lumo_exam_coll := (
  SELECT COLLATION_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exams' AND COLUMN_NAME = 'id'
);
SET @lumo_subj_cs := (
  SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'id'
);
SET @lumo_subj_coll := (
  SELECT COLLATION_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'subjects' AND COLUMN_NAME = 'id'
);
SET @lumo_venue_cs := (
  SELECT CHARACTER_SET_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_venues' AND COLUMN_NAME = 'id'
);
SET @lumo_venue_coll := (
  SELECT COLLATION_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pro_venues' AND COLUMN_NAME = 'id'
);
-- ขาดตารางใดตารางหนึ่ง = ทุกตัวแปรเป็น NULL -> ไม่สร้างอะไร (แจ้งใน info)
SET @lumo_go := (
  @lumo_exam_coll IS NOT NULL AND @lumo_subj_coll IS NOT NULL
  AND @lumo_venue_coll IS NOT NULL
);
SELECT @lumo_exam_coll AS exams_collation, @lumo_subj_coll AS subjects_collation,
  @lumo_venue_coll AS pro_venues_collation,
  IF(@lumo_go, 'ok', 'skipped: exams / subjects / pro_venues missing') AS info;

-- B1) predicted_series
SET @lumo_ddl := IF(
  @lumo_go,
  CONCAT(
    'CREATE TABLE IF NOT EXISTS `predicted_series` (',
    '`id` varchar(36) NOT NULL, ',
    '`venueId` varchar(36) CHARACTER SET ', @lumo_venue_cs, ' COLLATE ', @lumo_venue_coll, ' NOT NULL, ',
    '`subjectId` varchar(36) CHARACTER SET ', @lumo_subj_cs, ' COLLATE ', @lumo_subj_coll, ' NULL, ',
    '`title` varchar(150) NOT NULL, ',
    '`description` varchar(500) NULL, ',
    '`color` varchar(7) NULL, ',
    '`sortOrder` int NOT NULL DEFAULT 0, ',
    '`isActive` tinyint NOT NULL DEFAULT 1, ',
    '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
    '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
    'PRIMARY KEY (`id`), ',
    'KEY `IDX_predicted_series_venue_active_sort` (`venueId`, `isActive`, `sortOrder`), ',
    'KEY `IDX_predicted_series_subjectId` (`subjectId`), ',
    'CONSTRAINT `FK_predicted_series_venue` FOREIGN KEY (`venueId`) REFERENCES `pro_venues` (`id`) ON DELETE RESTRICT ON UPDATE NO ACTION, ',
    'CONSTRAINT `FK_predicted_series_subject` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION',
    ') ENGINE=InnoDB DEFAULT CHARSET=', @lumo_exam_cs, ' COLLATE=', @lumo_exam_coll
  ),
  'SELECT ''predicted_series skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- B2) predicted_sets
SET @lumo_ddl := IF(
  @lumo_go,
  CONCAT(
    'CREATE TABLE IF NOT EXISTS `predicted_sets` (',
    '`id` varchar(36) NOT NULL, ',
    '`seriesId` varchar(36) NOT NULL, ',
    '`examId` varchar(36) CHARACTER SET ', @lumo_exam_cs, ' COLLATE ', @lumo_exam_coll, ' NOT NULL, ',
    '`setNo` int NOT NULL, ',
    '`access` enum(''free'',''pro'') NOT NULL DEFAULT ''pro'', ',
    '`previewCount` int NULL, ',
    '`createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ',
    '`updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ',
    'PRIMARY KEY (`id`), ',
    'UNIQUE KEY `UQ_predicted_sets_examId` (`examId`), ',
    'UNIQUE KEY `UQ_predicted_sets_series_setNo` (`seriesId`, `setNo`), ',
    'CONSTRAINT `FK_predicted_sets_series` FOREIGN KEY (`seriesId`) REFERENCES `predicted_series` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION, ',
    'CONSTRAINT `FK_predicted_sets_exam` FOREIGN KEY (`examId`) REFERENCES `exams` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION',
    ') ENGINE=InnoDB DEFAULT CHARSET=', @lumo_exam_cs, ' COLLATE=', @lumo_exam_coll
  ),
  'SELECT ''predicted_sets skipped'' AS info'
);
PREPARE lumo_stmt FROM @lumo_ddl;
EXECUTE lumo_stmt;
DEALLOCATE PREPARE lumo_stmt;

-- ตรวจผล: column ที่ FK จับคู่กันต้องมี collation เดียวกัน, FK 4 ตัว, index 4 ตัว (ไม่รวม PRIMARY)
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME IN ('predicted_series', 'predicted_sets'))
    OR (TABLE_NAME IN ('exams', 'subjects', 'pro_venues') AND COLUMN_NAME = 'id')
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME, DELETE_RULE, UPDATE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('predicted_series', 'predicted_sets')
ORDER BY CONSTRAINT_NAME;

SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE,
  GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('predicted_series', 'predicted_sets')
  AND INDEX_NAME <> 'PRIMARY'
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;
