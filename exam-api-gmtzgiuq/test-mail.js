// ทดสอบส่งอีเมล - รัน: node test-mail.js
const nodemailer = require('nodemailer');
require('dotenv').config();

async function testMail() {
  console.log('📧 Testing Mail Configuration...\n');
  console.log('Host:', process.env.MAIL_HOST);
  console.log('Port:', process.env.MAIL_PORT);
  console.log('User:', process.env.MAIL_USER);
  console.log('From:', process.env.MAIL_FROM);
  console.log('Secure:', process.env.MAIL_PORT === '465' ? 'true (SSL)' : 'false');
  console.log('-----------------------------------\n');

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT),
    secure: process.env.MAIL_PORT === '465', // true for 465
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
  });

  try {
    // ทดสอบการเชื่อมต่อ
    console.log('🔌 Verifying connection...');
    await transporter.verify();
    console.log('✅ Connection successful!\n');

    // ส่งอีเมลทดสอบ
    console.log('📤 Sending test email...');
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: 'tapaebusiness@gmail.com', // ส่งหาตัวเอง
      subject: '🧪 Test Email from ExamPrep',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>✅ ระบบอีเมลทำงานปกติ!</h2>
          <p>นี่คืออีเมลทดสอบจากระบบ ExamPrep</p>
          <p>เวลา: ${new Date().toLocaleString('th-TH')}</p>
        </div>
      `,
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('\n🎉 Mail configuration is working!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'EAUTH') {
      console.log('\n💡 Hint: ตรวจสอบ username/password');
    } else if (error.code === 'ESOCKET') {
      console.log('\n💡 Hint: ตรวจสอบ host/port หรือ firewall');
    } else if (error.code === 'EENVELOPE') {
      console.log('\n💡 Hint: MAIL_FROM อาจไม่ตรงกับ MAIL_USER');
    }
  }
}

testMail();
