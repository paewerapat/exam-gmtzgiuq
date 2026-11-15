-- 20261120-01-domain-lumoexam.sql
--
-- Task:    ย้ายโดเมน API จาก https://api.lumo-test.com ไป https://api.lumoexam.com (โดเมนเก่าจะเลิกใช้)
-- Entity:  ไม่แก้ entity / ไม่แก้ schema — เป็น data migration อย่างเดียว
-- When:    **รันตอนสลับโดเมน หลังจาก API ตอบที่ https://api.lumoexam.com ได้แล้ว**
--          (เปิด https://api.lumoexam.com/uploads/<ไฟล์ที่มีอยู่> แล้วเห็นรูป) และควรรันก่อนปิดโดเมนเก่า
--          ถ้าตั้ง APP_URL ไว้บน Plesk ต้องเปลี่ยนเป็น https://api.lumoexam.com ก่อน/พร้อมกัน
--          ไม่งั้นรูปที่อัปโหลดหลังจากนี้จะยังได้ URL โดเมนเก่า (รันไฟล์นี้ซ้ำได้เพื่อเก็บตก)
--
-- ทำไมต้องรัน: POST /upload คืน URL แบบเต็ม `${APP_URL || proto://host}/uploads/<file>` และหน้าแอดมิน
--   เก็บ URL นั้นลง DB ตรง ๆ เช่น https://api.lumo-test.com/uploads/1700000000000-abcd.png
--   เมื่อโดเมนเก่าถูกปิด รูปเหล่านี้จะเสียทั้งหมด ไฟล์นี้เปลี่ยนเฉพาะส่วนโดเมนในข้อความ
--
-- สิ่งที่เปลี่ยน (REPLACE เฉพาะ 4 รูปแบบนี้ ที่เหลือของข้อความไม่แตะ):
--   https://api.lumo-test.com/        -> https://api.lumoexam.com/
--   http://api.lumo-test.com/         -> https://api.lumoexam.com/      (ยกเป็น https ด้วย ความยาวเท่าเดิม)
--   https:\/\/api.lumo-test.com\/     -> https:\/\/api.lumoexam.com\/   (รูปแบบ JSON ที่ escape "/")
--   http:\/\/api.lumo-test.com\/      -> https:\/\/api.lumoexam.com\/
--   ใน SQL ด้านล่างเขียน \ เป็น \\ ตามกฎ string literal ของ MySQL/MariaDB
--   TypeORM เขียน JSON ด้วย JSON.stringify ซึ่งไม่ escape "/" จึงปกติเจอแค่ 2 แบบแรก แบบ escape
--   ใส่ไว้เผื่อข้อมูลที่แก้ผ่าน phpMyAdmin/PHP (json_encode escape "/" เป็นค่าเริ่มต้น)
--   URL ใหม่ยาวไม่เกินของเดิม (สั้นลง 1 ตัวอักษร) ไม่มีปัญหา column varchar ล้น
--
-- ปลอดภัย / รันซ้ำได้:
--   - ทุก UPDATE มี WHERE ... LIKE '%api.lumo-test.com%' หลังรันแล้วแถวนั้นไม่มีโดเมนเก่า รอบถัดไปจึงไม่แตะอีก
--   - ตั้ง `updatedAt` = `updatedAt` เพื่อไม่ให้ ON UPDATE CURRENT_TIMESTAMP เปลี่ยนเวลาแก้ไขของแถว
--   - ไม่ใช้ information_schema / prepared statement (phpMyAdmin ของ production อ่าน information_schema ไม่ได้)
--   - JSON column บน MariaDB เป็น longtext + CHECK(json_valid) การแทนที่ข้อความใน string ของ JSON
--     ไม่ทำให้ JSON เสีย (ข้อความใหม่ไม่มี " หรือ \ เพิ่ม)
--   - โดเมนเว็บ https://lumo-test.com (ไม่มี api.) ไม่ถูกแตะ — ไฟล์นี้ย้ายเฉพาะ API/uploads
--
-- ขั้นตอนบน phpMyAdmin ของ Plesk (production, MariaDB):
--   0) Export (backup) ตาราง questions, exams, blogs, users, subjects, chapters, topics,
--      predicted_series, pro_venues, pro_page, pro_plans, pro_discount_codes, pro_subscriptions ก่อน
--   1) รัน "ส่วน A" (pre-check) จด total ของแต่ละแถวไว้
--   2) รัน "ส่วน B" (UPDATE) ทั้งก้อนในแท็บ SQL
--   3) รัน "ส่วน C" (post-check) ทุกแถวต้องได้ 0
--      ถ้ายังไม่ 0 = มีโดเมนเก่าในรูปแบบอื่น (เช่น ไม่มี / ท้าย, ไม่มี scheme, ตัวพิมพ์ใหญ่) ใช้ C2 ดูแถวแล้วแก้เอง
--   ถ้าได้ #1146 Table '...' doesn't exist = production ยังไม่มีตารางนั้น (ยังไม่ได้รัน SQL ของฟีเจอร์ Pro /
--   Predicted) ให้ลบบรรทัดของตารางนั้นออกจาก A2/B2/C1b แล้วรันต่อ (ส่วนที่รันไปแล้วรันซ้ำได้)
--
-- column ที่ครอบคลุม (รูป/URL ที่อัปโหลด + ข้อความอิสระที่แอดมินพิมพ์/วาง URL ได้):
--   questions.questionImage, questionImages (json), choices (json: image), question, explanation, hint
--   exams.bannerImage, passages (json: images/body), detailBlocks (json: url/text),
--        codeInstructions (json: linkUrl/description/note), description
--   blogs.featuredImage, content (markdown มีรูป), excerpt, metaDescription
--   users.avatar
--   subjects.description, chapters.description, topics.description
--   predicted_series.description
--   pro_venues.description, comparison (json)   pro_page.subtitle, footerNote
--   pro_plans.tagline, priceNote, entitlements (json)   pro_discount_codes.description   pro_subscriptions.note
-- ไม่ครอบคลุม (ตั้งใจ): id/enum/ตัวเลข/วันที่, ชื่อ/หัวข้อสั้น (title/name/slug/label/code),
--   ข้อมูลบันทึกเหตุการณ์และคำตอบของผู้ใช้ (feedback, analytics_events, exam_attempts, question_answers),
--   pro_payments.qrImageUrl (URL รูป QR ของ Omise ไม่ใช่โดเมนเรา), ค่า auth/token ของ users
--
-- ============================================================================
-- ส่วน A: pre-check — นับแถวที่มีโดเมนเก่าในแต่ละ column (อ่านอย่างเดียว)
-- ============================================================================

-- A1) ตารางหลัก
SELECT 'questions.questionImage' AS col, COUNT(*) AS total FROM `questions` WHERE `questionImage` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.questionImages', COUNT(*) FROM `questions` WHERE CAST(`questionImages` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.choices', COUNT(*) FROM `questions` WHERE CAST(`choices` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.question', COUNT(*) FROM `questions` WHERE `question` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.explanation', COUNT(*) FROM `questions` WHERE `explanation` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.hint', COUNT(*) FROM `questions` WHERE `hint` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.bannerImage', COUNT(*) FROM `exams` WHERE `bannerImage` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.passages', COUNT(*) FROM `exams` WHERE CAST(`passages` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.detailBlocks', COUNT(*) FROM `exams` WHERE CAST(`detailBlocks` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.codeInstructions', COUNT(*) FROM `exams` WHERE CAST(`codeInstructions` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.description', COUNT(*) FROM `exams` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.featuredImage', COUNT(*) FROM `blogs` WHERE `featuredImage` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.content', COUNT(*) FROM `blogs` WHERE `content` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.excerpt', COUNT(*) FROM `blogs` WHERE `excerpt` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.metaDescription', COUNT(*) FROM `blogs` WHERE `metaDescription` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'users.avatar', COUNT(*) FROM `users` WHERE `avatar` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'subjects.description', COUNT(*) FROM `subjects` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'chapters.description', COUNT(*) FROM `chapters` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'topics.description', COUNT(*) FROM `topics` WHERE `description` LIKE '%api.lumo-test.com%';

-- A2) ตาราง Pro / Predicted (ถ้า production ยังไม่มีตารางใดให้ลบบรรทัดนั้น)
SELECT 'predicted_series.description' AS col, COUNT(*) AS total FROM `predicted_series` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_venues.description', COUNT(*) FROM `pro_venues` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_venues.comparison', COUNT(*) FROM `pro_venues` WHERE CAST(`comparison` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_page.subtitle', COUNT(*) FROM `pro_page` WHERE `subtitle` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_page.footerNote', COUNT(*) FROM `pro_page` WHERE `footerNote` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_plans.tagline', COUNT(*) FROM `pro_plans` WHERE `tagline` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_plans.priceNote', COUNT(*) FROM `pro_plans` WHERE `priceNote` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_plans.entitlements', COUNT(*) FROM `pro_plans` WHERE CAST(`entitlements` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_discount_codes.description', COUNT(*) FROM `pro_discount_codes` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_subscriptions.note', COUNT(*) FROM `pro_subscriptions` WHERE `note` LIKE '%api.lumo-test.com%';

-- ============================================================================
-- ส่วน B: แทนที่โดเมน (รันซ้ำได้)
-- ============================================================================
-- ทุก UPDATE ใช้ REPLACE ซ้อน 4 ชั้นแบบเดียวกัน:
--   REPLACE(REPLACE(REPLACE(REPLACE(c,
--     'https://api.lumo-test.com/', 'https://api.lumoexam.com/'),
--     'http://api.lumo-test.com/', 'https://api.lumoexam.com/'),
--     'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'),
--     'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/')

-- B1) ตารางหลัก
UPDATE `questions` SET `questionImage` = REPLACE(REPLACE(REPLACE(REPLACE(`questionImage`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `questionImage` LIKE '%api.lumo-test.com%';
UPDATE `questions` SET `questionImages` = REPLACE(REPLACE(REPLACE(REPLACE(`questionImages`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`questionImages` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `questions` SET `choices` = REPLACE(REPLACE(REPLACE(REPLACE(`choices`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`choices` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `questions` SET `question` = REPLACE(REPLACE(REPLACE(REPLACE(`question`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `question` LIKE '%api.lumo-test.com%';
UPDATE `questions` SET `explanation` = REPLACE(REPLACE(REPLACE(REPLACE(`explanation`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `explanation` LIKE '%api.lumo-test.com%';
UPDATE `questions` SET `hint` = REPLACE(REPLACE(REPLACE(REPLACE(`hint`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `hint` LIKE '%api.lumo-test.com%';

UPDATE `exams` SET `bannerImage` = REPLACE(REPLACE(REPLACE(REPLACE(`bannerImage`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `bannerImage` LIKE '%api.lumo-test.com%';
UPDATE `exams` SET `passages` = REPLACE(REPLACE(REPLACE(REPLACE(`passages`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`passages` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `exams` SET `detailBlocks` = REPLACE(REPLACE(REPLACE(REPLACE(`detailBlocks`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`detailBlocks` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `exams` SET `codeInstructions` = REPLACE(REPLACE(REPLACE(REPLACE(`codeInstructions`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`codeInstructions` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `exams` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';

UPDATE `blogs` SET `featuredImage` = REPLACE(REPLACE(REPLACE(REPLACE(`featuredImage`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `featuredImage` LIKE '%api.lumo-test.com%';
UPDATE `blogs` SET `content` = REPLACE(REPLACE(REPLACE(REPLACE(`content`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `content` LIKE '%api.lumo-test.com%';
UPDATE `blogs` SET `excerpt` = REPLACE(REPLACE(REPLACE(REPLACE(`excerpt`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `excerpt` LIKE '%api.lumo-test.com%';
UPDATE `blogs` SET `metaDescription` = REPLACE(REPLACE(REPLACE(REPLACE(`metaDescription`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `metaDescription` LIKE '%api.lumo-test.com%';

UPDATE `users` SET `avatar` = REPLACE(REPLACE(REPLACE(REPLACE(`avatar`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `avatar` LIKE '%api.lumo-test.com%';

UPDATE `subjects` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';
UPDATE `chapters` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';
UPDATE `topics` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';

-- B2) ตาราง Pro / Predicted (ถ้า production ยังไม่มีตารางใดให้ลบบรรทัดนั้น)
UPDATE `predicted_series` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';
UPDATE `pro_venues` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';
UPDATE `pro_venues` SET `comparison` = REPLACE(REPLACE(REPLACE(REPLACE(`comparison`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`comparison` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `pro_page` SET `subtitle` = REPLACE(REPLACE(REPLACE(REPLACE(`subtitle`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `subtitle` LIKE '%api.lumo-test.com%';
UPDATE `pro_page` SET `footerNote` = REPLACE(REPLACE(REPLACE(REPLACE(`footerNote`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `footerNote` LIKE '%api.lumo-test.com%';
UPDATE `pro_plans` SET `tagline` = REPLACE(REPLACE(REPLACE(REPLACE(`tagline`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `tagline` LIKE '%api.lumo-test.com%';
UPDATE `pro_plans` SET `priceNote` = REPLACE(REPLACE(REPLACE(REPLACE(`priceNote`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `priceNote` LIKE '%api.lumo-test.com%';
UPDATE `pro_plans` SET `entitlements` = REPLACE(REPLACE(REPLACE(REPLACE(`entitlements`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE CAST(`entitlements` AS CHAR) LIKE '%api.lumo-test.com%';
UPDATE `pro_discount_codes` SET `description` = REPLACE(REPLACE(REPLACE(REPLACE(`description`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `description` LIKE '%api.lumo-test.com%';
UPDATE `pro_subscriptions` SET `note` = REPLACE(REPLACE(REPLACE(REPLACE(`note`, 'https://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'http://api.lumo-test.com/', 'https://api.lumoexam.com/'), 'https:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), 'http:\\/\\/api.lumo-test.com\\/', 'https:\\/\\/api.lumoexam.com\\/'), `updatedAt` = `updatedAt` WHERE `note` LIKE '%api.lumo-test.com%';

-- ============================================================================
-- ส่วน C: post-check — ทุกแถวต้องได้ total = 0
-- ============================================================================

-- C1a) ตารางหลัก
SELECT 'questions.questionImage' AS col, COUNT(*) AS total FROM `questions` WHERE `questionImage` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.questionImages', COUNT(*) FROM `questions` WHERE CAST(`questionImages` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.choices', COUNT(*) FROM `questions` WHERE CAST(`choices` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.question', COUNT(*) FROM `questions` WHERE `question` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.explanation', COUNT(*) FROM `questions` WHERE `explanation` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'questions.hint', COUNT(*) FROM `questions` WHERE `hint` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.bannerImage', COUNT(*) FROM `exams` WHERE `bannerImage` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.passages', COUNT(*) FROM `exams` WHERE CAST(`passages` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.detailBlocks', COUNT(*) FROM `exams` WHERE CAST(`detailBlocks` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.codeInstructions', COUNT(*) FROM `exams` WHERE CAST(`codeInstructions` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'exams.description', COUNT(*) FROM `exams` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.featuredImage', COUNT(*) FROM `blogs` WHERE `featuredImage` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.content', COUNT(*) FROM `blogs` WHERE `content` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.excerpt', COUNT(*) FROM `blogs` WHERE `excerpt` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'blogs.metaDescription', COUNT(*) FROM `blogs` WHERE `metaDescription` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'users.avatar', COUNT(*) FROM `users` WHERE `avatar` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'subjects.description', COUNT(*) FROM `subjects` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'chapters.description', COUNT(*) FROM `chapters` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'topics.description', COUNT(*) FROM `topics` WHERE `description` LIKE '%api.lumo-test.com%';

-- C1b) ตาราง Pro / Predicted
SELECT 'predicted_series.description' AS col, COUNT(*) AS total FROM `predicted_series` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_venues.description', COUNT(*) FROM `pro_venues` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_venues.comparison', COUNT(*) FROM `pro_venues` WHERE CAST(`comparison` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_page.subtitle', COUNT(*) FROM `pro_page` WHERE `subtitle` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_page.footerNote', COUNT(*) FROM `pro_page` WHERE `footerNote` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_plans.tagline', COUNT(*) FROM `pro_plans` WHERE `tagline` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_plans.priceNote', COUNT(*) FROM `pro_plans` WHERE `priceNote` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_plans.entitlements', COUNT(*) FROM `pro_plans` WHERE CAST(`entitlements` AS CHAR) LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_discount_codes.description', COUNT(*) FROM `pro_discount_codes` WHERE `description` LIKE '%api.lumo-test.com%'
UNION ALL SELECT 'pro_subscriptions.note', COUNT(*) FROM `pro_subscriptions` WHERE `note` LIKE '%api.lumo-test.com%';

-- C2) (ถ้า C1 ไม่เป็น 0) ดูแถวที่ยังเหลือ — เปลี่ยนชื่อตาราง/column ให้ตรงกับแถวที่ไม่เป็น 0 แล้วรัน
--     แสดงข้อความรอบ ๆ จุดที่เจอ 60 ตัวอักษร เพื่อดูว่าเป็นรูปแบบไหน แล้วแก้ด้วยมือ
--
-- SELECT `id`, SUBSTRING(CAST(`content` AS CHAR), GREATEST(LOCATE('api.lumo-test.com', CAST(`content` AS CHAR)) - 30, 1), 80) AS around
-- FROM `blogs` WHERE CAST(`content` AS CHAR) LIKE '%api.lumo-test.com%';
