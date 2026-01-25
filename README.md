# ExamPrep - Online Exam Practice Platform

เว็บแอปพลิเคชันสำหรับฝึกทำข้อสอบออนไลน์ พัฒนาด้วย Next.js (Frontend) และ Nest.js (Backend)

## 🚀 Features ที่มีในปัจจุบัน

### Authentication & User Management
- ✅ ระบบสมัครสมาชิกและเข้าสู่ระบบด้วย Email
- ✅ Email Verification (ยืนยันอีเมล)
- ✅ Reset Password (รีเซ็ตรหัสผ่าน)
- ✅ User Profile Management
- ✅ JWT Authentication
- 🔄 Google OAuth (พร้อม setup แต่รอ credentials)

### Pages
- ✅ Landing Page (หน้าแรก)
- ✅ Login/Register Pages
- ✅ Blogs Page
- ✅ User Profile Page
- ✅ Email Verification Page
- ✅ Forgot Password Page
- ✅ Reset Password Page

## 📁 โครงสร้างโปรเจค

```
├── exam-api-gmtzgiuq/          # Backend (Nest.js)
│   ├── src/
│   │   ├── auth/              # Authentication Module
│   │   ├── users/             # Users Module
│   │   ├── mail/              # Email Service
│   │   └── common/            # Guards, Decorators
│   └── .env                   # Backend environment variables
│
├── exam-web-gmtzgiuq/          # Frontend (Next.js)
│   ├── app/                   # App Router Pages
│   ├── components/            # React Components
│   ├── contexts/              # React Contexts
│   ├── lib/                   # Apollo Client, Utils
│   └── .env.local            # Frontend environment variables
```

## 🛠️ Tech Stack

### Backend
- **Nest.js** - Node.js Framework
- **TypeORM** - ORM สำหรับ MariaDB
- **GraphQL** (Apollo Server) - API Layer
- **Passport** - Authentication (JWT, Local)
- **Nodemailer** - Email Service
- **MariaDB** - Database

### Frontend
- **Next.js 16** - React Framework
- **Apollo Client** - GraphQL Client
- **TailwindCSS** - CSS Framework
- **Lucide React** - Icons
- **TypeScript** - Type Safety

## 📦 การติดตั้ง

### 1. Clone โปรเจค (ถ้ามี Git)
```bash
git clone <repository-url>
cd 559LDU4Z
```

### 2. ติดตั้ง Backend

```bash
cd exam-api-gmtzgiuq
npm install
```

#### สร้างไฟล์ `.env` ใน folder `exam-api-gmtzgiuq`
```env
# Database Configuration
DB_HOST=your_mariadb_host
DB_PORT=3306
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=exam_db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=7d

# Email Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=noreply@examprep.com

# Application
APP_PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

**สำคัญ:** สำหรับ Gmail, คุณต้องใช้ **App Password** ไม่ใช่รหัสผ่านปกติ
- ไปที่ Google Account → Security → 2-Step Verification → App Passwords
- สร้าง App Password ใหม่และนำมาใส่ใน `MAIL_PASSWORD`

### 3. ติดตั้ง Frontend

```bash
cd ../exam-web-gmtzgiuq
npm install
```

#### สร้างไฟล์ `.env.local` ใน folder `exam-web-gmtzgiuq`
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_GRAPHQL_URL=http://localhost:3001/graphql
```

## 🚀 การรันโปรเจค

### 1. เริ่ม Backend (Terminal 1)
```bash
cd exam-api-gmtzgiuq
npm run start:dev
```

Backend จะรันที่: `http://localhost:3001`
GraphQL Playground: `http://localhost:3001/graphql`

### 2. เริ่ม Frontend (Terminal 2)
```bash
cd exam-web-gmtzgiuq
npm run dev
```

Frontend จะรันที่: `http://localhost:3000`

## 📚 การใช้งาน

### 1. สมัครสมาชิก
- ไปที่ http://localhost:3000/register
- กรอกข้อมูล Email, Password และชื่อ-นามสกุล
- กด "Create Account"
- ระบบจะส่งอีเมลยืนยันไปที่อีเมลที่ลงทะเบียน

### 2. ยืนยันอีเมล
- เปิดอีเมลและคลิกลิงก์ยืนยัน
- หรือไปที่ `/verify-email?token=xxx` โดยตรง

### 3. เข้าสู่ระบบ
- ไปที่ http://localhost:3000/login
- กรอก Email และ Password
- กด "Sign In"

### 4. รีเซ็ตรหัสผ่าน (ถ้าลืม)
- ไปที่ http://localhost:3000/forgot-password
- กรอกอีเมล
- ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมล
- คลิกลิงก์และตั้งรหัสผ่านใหม่

## 🗄️ Database Schema

### Users Table
```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  firstName VARCHAR(255),
  lastName VARCHAR(255),
  avatar VARCHAR(255),
  isEmailVerified BOOLEAN DEFAULT FALSE,
  emailVerificationToken VARCHAR(255),
  emailVerificationExpires TIMESTAMP,
  resetPasswordToken VARCHAR(255),
  resetPasswordExpires TIMESTAMP,
  provider VARCHAR(50) DEFAULT 'local',
  providerId VARCHAR(255),
  isActive BOOLEAN DEFAULT TRUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

ไม่ต้องสร้างเอง! TypeORM จะสร้างตารางอัตโนมัติเมื่อ `synchronize: true` ใน development mode

## 🔧 API Endpoints

### REST API
- `POST /auth/register` - สมัครสมาชิก
- `POST /auth/login` - เข้าสู่ระบบ
- `POST /auth/verify-email` - ยืนยันอีเมล
- `POST /auth/request-password-reset` - ขอรีเซ็ตรหัสผ่าน
- `POST /auth/reset-password` - รีเซ็ตรหัสผ่าน
- `GET /auth/me` - ดูข้อมูลผู้ใช้ปัจจุบัน (ต้อง login)

### GraphQL API
เปิด GraphQL Playground ที่ `http://localhost:3001/graphql`

**Mutations:**
```graphql
# สมัครสมาชิก
mutation Register {
  register(input: {
    email: "user@example.com"
    password: "password123"
    firstName: "John"
    lastName: "Doe"
  }) {
    accessToken
    user {
      id
      email
      firstName
      lastName
    }
  }
}

# เข้าสู่ระบบ
mutation Login {
  login(email: "user@example.com", password: "password123") {
    accessToken
    user {
      id
      email
      isEmailVerified
    }
  }
}
```

**Queries:**
```graphql
# ดูข้อมูลผู้ใช้ (ต้องส่ง Authorization header)
query Me {
  me {
    id
    email
    firstName
    lastName
    isEmailVerified
  }
}
```

## 🎨 การปรับแต่ง UI

สีหลักของเว็บ: **Indigo (ม่วงน้ำเงิน)**

แก้ไขสีใน TailwindCSS:
- `bg-indigo-600` - สีพื้นหลังปุ่มหลัก
- `text-indigo-600` - สีข้อความ
- `border-indigo-600` - สีขอบ

## 📝 TODO ถัดไป

### ฟีเจอร์ที่ควรเพิ่ม
- [ ] Google OAuth Integration (เมื่อมี Client ID & Secret)
- [ ] Exam/Quiz Module (สร้างชุดข้อสอบ)
- [ ] Question Bank Module (คลังข้อสอบ)
- [ ] Test Taking Module (ทำข้อสอบ)
- [ ] Results & Analytics (ผลคะแนนและสถิติ)
- [ ] Admin Dashboard (จัดการระบบ)
- [ ] Blog CRUD (สร้าง/แก้ไข/ลบบทความ)

### การปรับปรุง
- [ ] เพิ่ม Unit Tests
- [ ] เพิ่ม E2E Tests
- [ ] Optimize Performance
- [ ] Add Loading States
- [ ] Better Error Handling
- [ ] Add Toast Notifications
- [ ] Responsive Design Improvements

## 🐛 แก้ปัญหาที่พบบ่อย

### Backend ไม่เชื่อมต่อ Database
- ตรวจสอบ `.env` ว่าข้อมูล DB ถูกต้อง
- ตรวจสอบว่า MariaDB รันอยู่
- ลองเชื่อมต่อด้วย MySQL Workbench หรือ DBeaver

### ส่งอีเมลไม่ได้
- ตรวจสอบว่าใช้ Gmail App Password (ไม่ใช่รหัสผ่านปกติ)
- ตรวจสอบ `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD` ใน `.env`
- ดู Console Log ของ Backend

### Frontend เชื่อมต่อ Backend ไม่ได้
- ตรวจสอบว่า Backend รันอยู่ที่ port 3001
- ตรวจสอบ `.env.local` ว่า URL ถูกต้อง
- เปิด Browser Console ดู Error

## 📞 ติดต่อ

หากมีคำถามหรือปัญหา สามารถติดต่อได้ที่:
- สร้าง Issue ใน GitHub
- หรือติดต่อผู้พัฒนาโดยตรง

## 📄 License

โปรเจคนี้สร้างขึ้นเพื่อการศึกษาและพัฒนาต่อยอด
