# 🚀 Quick Start Guide

## ขั้นตอนการเริ่มต้นใช้งาน

### 1. ตรวจสอบไฟล์ Environment Variables

#### Backend (.env)
ตรวจสอบว่าคุณได้แก้ไขข้อมูลใน `exam-api-gmtzgiuq/.env` แล้ว:
```env
DB_HOST=your_actual_host
DB_USERNAME=your_actual_username
DB_PASSWORD=your_actual_password
DB_DATABASE=exam_db

MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-gmail-app-password

JWT_SECRET=change-this-to-random-string
```

#### Frontend (.env.local)
ตรวจสอบว่าคุณได้สร้างไฟล์ `exam-web-gmtzgiuq/.env.local` แล้ว:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:3001/graphql
```

### 2. เริ่มต้นใช้งาน

เปิด 2 Terminal windows:

**Terminal 1 - Backend:**
```bash
cd exam-api-gmtzgiuq
npm run start:dev
```
รอจนกว่าจะเห็นข้อความ:
```
🚀 Application is running on: http://localhost:3001
📊 GraphQL Playground: http://localhost:3001/graphql
```

**Terminal 2 - Frontend:**
```bash
cd exam-web-gmtzgiuq
npm run dev
```
รอจนกว่าจะเห็นข้อความ:
```
✓ Ready in 2.5s
○ Local: http://localhost:3000
```

### 3. ทดสอบระบบ

1. เปิดเบราว์เซอร์ไปที่ `http://localhost:3000`
2. คลิก "Get Started Free" หรือ "Sign Up Now"
3. กรอกข้อมูลสมัครสมาชิก
4. ตรวจสอบอีเมลเพื่อยืนยันการสมัคร
5. เข้าสู่ระบบและเริ่มใช้งาน!

## ⚠️ สิ่งสำคัญที่ต้องทำก่อนใช้งาน

### Gmail App Password
หากใช้ Gmail ในการส่งอีเมล คุณต้องสร้าง App Password:

1. ไปที่ https://myaccount.google.com/security
2. เปิด "2-Step Verification" (ถ้ายังไม่เปิด)
3. ไปที่ "App Passwords" (ที่ด้านล่าง 2-Step Verification)
4. สร้าง App Password ใหม่
5. นำรหัส 16 หลักที่ได้มาใส่ในค่า `MAIL_PASSWORD` ใน `.env`

### Database Setup
TypeORM จะสร้างตารางอัตโนมัติ แต่คุณต้อง:
1. สร้าง Database ชื่อ `exam_db` ใน MariaDB ก่อน
2. ตรวจสอบว่า MariaDB รันอยู่

```sql
CREATE DATABASE exam_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 🧪 ทดสอบการทำงาน

### Test Backend API
เปิด GraphQL Playground: http://localhost:3001/graphql

ลองรัน query นี้:
```graphql
mutation {
  register(input: {
    email: "test@example.com"
    password: "test123"
    firstName: "Test"
    lastName: "User"
  }) {
    accessToken
    user {
      email
      firstName
    }
  }
}
```

### Test Frontend
1. ไปที่ http://localhost:3000
2. ควรเห็นหน้า Landing Page พร้อม Hero Section
3. คลิก "Login" ที่มุมบนขวา
4. ควรเห็นหน้า Login Form

## 📊 Port ที่ใช้

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:3001`
- GraphQL Playground: `http://localhost:3001/graphql`
- MariaDB: `localhost:3306` (default)

## ❓ แก้ปัญหาเบื้องต้น

### Error: Cannot connect to database
```bash
# ตรวจสอบว่า MariaDB รันอยู่
# Windows:
services.msc → ค้นหา MariaDB

# หรือทดสอบเชื่อมต่อ
mysql -h localhost -u your_username -p
```

### Error: Port 3000 already in use
```bash
# Frontend
# เปลี่ยน port ใน package.json:
"dev": "next dev -p 3002"
```

### Error: CORS issues
- ตรวจสอบว่า `FRONTEND_URL` ใน Backend `.env` ตรงกับ URL ที่ Frontend รันอยู่
- ปกติควรเป็น `http://localhost:3000`

### Email ส่งไม่ออก
- ตรวจสอบ Gmail App Password อีกครั้ง
- ตรวจสอบ Console ของ Backend ดู Error Message
- ลอง MAIL_PORT=587 หรือ 465

## 📝 Next Steps

หลังจาก Setup เสร็จแล้ว:

1. อ่าน [README.md](README.md) ฉบับเต็มเพื่อทำความเข้าใจระบบ
2. ทดลองสมัครสมาชิกและทดสอบระบบ Authentication
3. เริ่มพัฒนาฟีเจอร์เพิ่มเติมตามต้องการ

## 🎯 ฟีเจอร์ที่พร้อมใช้งาน

✅ Landing Page
✅ Login/Register
✅ Email Verification
✅ Password Reset
✅ User Profile
✅ Blogs Page (mock data)

## 🔜 ฟีเจอร์ที่ต้องพัฒนาต่อ

- Exam/Quiz System
- Question Bank
- Test Taking Module
- Results & Analytics
- Admin Dashboard

---

**สนุกกับการพัฒนา! 🚀**
