# 🚀 คำแนะนำการ Deploy ขึ้น Plesk Hosting

## 📁 โครงสร้างไฟล์หลังจาก Build

### Backend (exam-api-gmtzgiuq)
```
exam-api-gmtzgiuq/
├── dist/                 ⬅️ โฟลเดอร์ที่ต้องอัพโหลด
│   └── (compiled files)
├── node_modules/         ⬅️ ต้องอัพโหลด (หรือรัน npm install บน server)
├── package.json          ⬅️ ต้องอัพโหลด
├── package-lock.json     ⬅️ ต้องอัพโหลด
└── .env                  ⬅️ ต้องอัพโหลด (แก้ค่าให้ตรงกับ Production)
```

### Frontend (exam-web-gmtzgiuq)
```
exam-web-gmtzgiuq/
├── .next/                ⬅️ โฟลเดอร์ที่ต้องอัพโหลด
│   ├── standalone/       ⬅️ (ถ้ามี) ใช้สำหรับ standalone mode
│   └── static/
├── public/               ⬅️ ต้องอัพโหลด
├── node_modules/         ⬅️ ต้องอัพโหลด
├── package.json          ⬅️ ต้องอัพโหลด
├── package-lock.json     ⬅️ ต้องอัพโหลด
└── .env.local            ⬅️ ต้องอัพโหลด (แก้ค่าให้ตรงกับ Production)
```

---

## 🔧 วิธี Deploy บน Plesk

### ขั้นตอนที่ 1: ตรวจสอบ Node.js Extension บน Plesk

1. เข้า Plesk Panel
2. ไปที่ **Extensions** → **My Extensions**
3. ค้นหา **Node.js** และติดตั้งถ้ายังไม่มี

### ขั้นตอนที่ 2: สร้าง Subdomain สำหรับ API

แนะนำให้แยก API ออกมาเป็น subdomain:
- `api.yourdomain.com` → Backend (Nest.js)
- `www.yourdomain.com` หรือ `yourdomain.com` → Frontend (Next.js)

### ขั้นตอนที่ 3: Deploy Backend (Nest.js API)

#### 3.1 อัพโหลดไฟล์ผ่าน FileZilla

1. เชื่อมต่อ FTP/SFTP ไปยัง server
2. ไปที่โฟลเดอร์ของ subdomain `api.yourdomain.com`
3. อัพโหลดไฟล์ต่อไปนี้จาก `exam-api-gmtzgiuq/`:
   ```
   - dist/ (ทั้งโฟลเดอร์)
   - package.json
   - package-lock.json
   - .env (แก้ไขค่าให้เหมาะกับ Production ก่อน)
   ```

#### 3.2 ตั้งค่า Node.js Application บน Plesk

1. ไปที่ **Websites & Domains** → เลือก `api.yourdomain.com`
2. คลิก **Node.js**
3. ตั้งค่าดังนี้:
   - **Node.js Version**: เลือก v18 หรือ v20
   - **Application Mode**: Production
   - **Document Root**: `/httpdocs`
   - **Application Root**: `/httpdocs`
   - **Application Startup File**: `dist/main.js`
4. คลิก **Enable Node.js**
5. คลิก **NPM Install** เพื่อติดตั้ง dependencies

#### 3.3 แก้ไข .env สำหรับ Production

```env
# Database Configuration - แก้ไขให้ตรงกับ Production DB
DB_HOST=your-production-db-host
DB_PORT=3306
DB_USERNAME=your-production-username
DB_PASSWORD=your-production-password
DB_DATABASE=exam_db

# JWT - ใช้ secret ที่แข็งแรง
JWT_SECRET=your-very-long-and-secure-random-string-here
JWT_EXPIRES_IN=7d

# Email - แก้ไขให้ตรงกับ SMTP ของ Hosting
MAIL_HOST=mail.yourdomain.com
MAIL_PORT=587
MAIL_USER=noreply@yourdomain.com
MAIL_PASSWORD=your-email-password
MAIL_FROM=noreply@yourdomain.com

# Application
APP_PORT=3001
NODE_ENV=production

# Frontend URL - แก้ไขเป็น production URL
FRONTEND_URL=https://yourdomain.com
```

### ขั้นตอนที่ 4: Deploy Frontend (Next.js)

#### 4.1 อัพโหลดไฟล์ผ่าน FileZilla

1. ไปที่โฟลเดอร์ของ domain หลัก `yourdomain.com`
2. อัพโหลดไฟล์ต่อไปนี้จาก `exam-web-gmtzgiuq/`:
   ```
   - .next/ (ทั้งโฟลเดอร์)
   - public/ (ทั้งโฟลเดอร์)
   - package.json
   - package-lock.json
   - .env.local (แก้ไขค่าให้เหมาะกับ Production ก่อน)
   - next.config.ts
   ```

#### 4.2 ตั้งค่า Node.js Application บน Plesk

1. ไปที่ **Websites & Domains** → เลือก `yourdomain.com`
2. คลิก **Node.js**
3. ตั้งค่าดังนี้:
   - **Node.js Version**: เลือก v18 หรือ v20 (ตรงกับ Backend)
   - **Application Mode**: Production
   - **Document Root**: `/httpdocs`
   - **Application Root**: `/httpdocs`
   - **Application Startup File**: `node_modules/next/dist/bin/next` หรือ ใช้ custom start script
4. คลิก **Enable Node.js**
5. คลิก **NPM Install**

#### 4.3 สร้าง Custom Start Script (แนะนำ)

สร้างไฟล์ `server.js` ใน root ของ Frontend:

```javascript
const { exec } = require('child_process');
exec('npm start', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error}`);
    return;
  }
  console.log(stdout);
});
```

หรือแก้ไข package.json เพิ่ม script:
```json
{
  "scripts": {
    "start": "next start -p 3000"
  }
}
```

#### 4.4 แก้ไข .env.local สำหรับ Production

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_GRAPHQL_URL=https://api.yourdomain.com/graphql
```

---

## 🔄 ทางเลือก: Static Export (ถ้า Plesk ไม่รองรับ Node.js)

ถ้า Plesk ไม่มี Node.js Extension สามารถ export Next.js เป็น static files:

### แก้ไข next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
};

export default nextConfig;
```

### Build Static

```bash
cd exam-web-gmtzgiuq
npm run build
```

### อัพโหลด

อัพโหลดเฉพาะโฟลเดอร์ `out/` ไปที่ `httpdocs/`

**⚠️ ข้อจำกัด**: Static export ไม่รองรับ Server Components และ API Routes

---

## 🌐 ตั้งค่า CORS และ Proxy (สำคัญ!)

### ถ้าใช้ Subdomain แยก (api.yourdomain.com)

Backend `.env`:
```env
FRONTEND_URL=https://yourdomain.com
```

### ถ้าใช้ Proxy ผ่าน Nginx

เพิ่ม config ใน Plesk → Apache & nginx Settings:

```nginx
location /api {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}

location /graphql {
    proxy_pass http://localhost:3001/graphql;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## ✅ Checklist ก่อน Deploy

### Backend
- [ ] Build สำเร็จ (`npm run build`)
- [ ] แก้ไข `.env` สำหรับ Production
- [ ] ทดสอบ Database connection
- [ ] อัพโหลด `dist/`, `package.json`, `.env`
- [ ] รัน `npm install` บน server
- [ ] ตั้งค่า Node.js Application บน Plesk
- [ ] ทดสอบ API endpoint

### Frontend
- [ ] Build สำเร็จ (`npm run build`)
- [ ] แก้ไข `.env.local` สำหรับ Production
- [ ] อัพโหลด `.next/`, `public/`, `package.json`, `.env.local`
- [ ] รัน `npm install` บน server
- [ ] ตั้งค่า Node.js Application บน Plesk
- [ ] ทดสอบหน้าเว็บ

### ทั่วไป
- [ ] SSL Certificate (HTTPS) ติดตั้งแล้ว
- [ ] CORS ตั้งค่าถูกต้อง
- [ ] Email service ทำงานได้
- [ ] ทดสอบ Login/Register

---

## 🐛 แก้ปัญหาที่พบบ่อย

### Error: EACCES permission denied
```bash
# บน server ให้รัน
chmod -R 755 node_modules
chmod 644 .env
```

### Error: Cannot find module
```bash
# ลบ node_modules แล้ว install ใหม่
rm -rf node_modules
npm install
```

### Error: Port already in use
- ตรวจสอบว่าไม่มี process อื่นใช้ port
- หรือเปลี่ยน port ใน .env

### CORS Error
- ตรวจสอบ `FRONTEND_URL` ใน Backend `.env`
- ตรวจสอบว่า URL ถูกต้อง (มี/ไม่มี trailing slash)

### Database Connection Error
- ตรวจสอบ firewall rules
- ตรวจสอบ DB credentials
- ทดสอบ connection จาก server

---

## 📞 ต้องการความช่วยเหลือเพิ่มเติม?

หากมีปัญหาในการ deploy สามารถ:
1. ตรวจสอบ Plesk Error Logs
2. ดู Node.js Application Logs บน Plesk
3. ติดต่อ Hosting Provider
