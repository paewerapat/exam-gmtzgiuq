'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Target,
  TrendingUp,
  Award,
  FileQuestion,
  CheckCircle,
  Star,
  ArrowRight,
  Play,
  BarChart3,
  Shield
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';
import { StaggerContainer, StaggerItem } from '@/components/animations/StaggerContainer';

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white py-24 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <motion.div
            className="absolute top-20 left-10 w-72 h-72 bg-white rounded-full blur-3xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
          <motion.div
            className="absolute bottom-20 right-10 w-96 h-96 bg-purple-300 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.1, 0.15, 0.1],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            <motion.span
              className="inline-block bg-white/20 text-white text-sm px-4 py-2 rounded-full mb-6 backdrop-blur-sm"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              แพลตฟอร์มฝึกสอบออนไลน์อันดับ 1
            </motion.span>
            <motion.h1
              className="text-5xl md:text-6xl font-bold mb-6 leading-tight"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              พิชิตทุกการสอบด้วย
              <motion.span
                className="block text-yellow-300"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                ExamPrep
              </motion.span>
            </motion.h1>
            <motion.p
              className="text-xl text-indigo-100 mb-8 max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              ฝึกทำข้อสอบจำลองที่ครอบคลุม พร้อมรับ feedback ทันที
              และวิเคราะห์ผลอย่างละเอียดเพื่อติดตามความก้าวหน้าของคุณ
            </motion.p>
            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <Link
                href="/register"
                className="bg-white text-indigo-600 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                เริ่มต้นฟรี
              </Link>
              <Link
                href="/blogs"
                className="bg-transparent text-white px-8 py-4 rounded-xl text-lg font-semibold border-2 border-white/50 hover:bg-white/10 transition flex items-center justify-center"
              >
                <Play className="w-5 h-5 mr-2" />
                ดูรายละเอียด
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8" staggerDelay={0.1}>
            <StaggerItem direction="up">
              <div className="text-center">
                <motion.div
                  className="text-4xl md:text-5xl font-bold text-indigo-600 mb-2"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 100, delay: 0 }}
                >
                  10,000+
                </motion.div>
                <div className="text-gray-600">ผู้ใช้งาน</div>
              </div>
            </StaggerItem>
            <StaggerItem direction="up">
              <div className="text-center">
                <motion.div
                  className="text-4xl md:text-5xl font-bold text-purple-600 mb-2"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 100, delay: 0.1 }}
                >
                  50,000+
                </motion.div>
                <div className="text-gray-600">ข้อสอบ</div>
              </div>
            </StaggerItem>
            <StaggerItem direction="up">
              <div className="text-center">
                <motion.div
                  className="text-4xl md:text-5xl font-bold text-green-600 mb-2"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 100, delay: 0.2 }}
                >
                  95%
                </motion.div>
                <div className="text-gray-600">ความพึงพอใจ</div>
              </div>
            </StaggerItem>
            <StaggerItem direction="up">
              <div className="text-center">
                <motion.div
                  className="text-4xl md:text-5xl font-bold text-orange-600 mb-2"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: 'spring', stiffness: 100, delay: 0.3 }}
                >
                  100+
                </motion.div>
                <div className="text-gray-600">หมวดหมู่</div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              ทำไมต้องเลือก ExamPrep?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              ทุกสิ่งที่คุณต้องการเพื่อประสบความสำเร็จในการสอบ
            </p>
          </FadeIn>

          <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-4 gap-8" staggerDelay={0.1}>
            <StaggerItem direction="up">
              <motion.div
                className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-lg transition group"
                whileHover={{ y: -5 }}
              >
                <div className="inline-block p-4 bg-indigo-100 rounded-2xl mb-6 group-hover:bg-indigo-600 transition">
                  <BookOpen className="w-8 h-8 text-indigo-600 group-hover:text-white transition" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  ข้อสอบครอบคลุม
                </h3>
                <p className="text-gray-600">เข้าถึงข้อสอบนับพันที่ครอบคลุมทุกหัวข้อในการสอบของคุณ</p>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div
                className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-lg transition group"
                whileHover={{ y: -5 }}
              >
                <div className="inline-block p-4 bg-purple-100 rounded-2xl mb-6 group-hover:bg-purple-600 transition">
                  <Target className="w-8 h-8 text-purple-600 group-hover:text-white transition" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  Feedback ทันที
                </h3>
                <p className="text-gray-600">รับผลลัพธ์ทันทีพร้อมคำอธิบายละเอียดสำหรับทุกคำถาม</p>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div
                className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-lg transition group"
                whileHover={{ y: -5 }}
              >
                <div className="inline-block p-4 bg-green-100 rounded-2xl mb-6 group-hover:bg-green-600 transition">
                  <TrendingUp className="w-8 h-8 text-green-600 group-hover:text-white transition" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  ติดตามความก้าวหน้า
                </h3>
                <p className="text-gray-600">ดูพัฒนาการของคุณด้วยการวิเคราะห์และข้อมูลเชิงลึกอย่างละเอียด</p>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div
                className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-lg transition group"
                whileHover={{ y: -5 }}
              >
                <div className="inline-block p-4 bg-yellow-100 rounded-2xl mb-6 group-hover:bg-yellow-600 transition">
                  <Award className="w-8 h-8 text-yellow-600 group-hover:text-white transition" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  เนื้อหาจากผู้เชี่ยวชาญ
                </h3>
                <p className="text-gray-600">ข้อสอบคัดสรรโดยผู้เชี่ยวชาญและนักการศึกษามืออาชีพ</p>
              </motion.div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              เริ่มต้นง่ายๆ ใน 3 ขั้นตอน
            </h2>
            <p className="text-xl text-gray-600">
              ไม่ยุ่งยาก พร้อมเริ่มทำข้อสอบได้ทันที
            </p>
          </FadeIn>

          <StaggerContainer className="grid md:grid-cols-3 gap-8" staggerDelay={0.2}>
            <StaggerItem direction="up">
              <div className="text-center relative">
                <motion.div
                  className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg"
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  1
                </motion.div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">สมัครสมาชิก</h3>
                <p className="text-gray-600">สร้างบัญชีฟรีใน 30 วินาที ไม่ต้องใช้บัตรเครดิต</p>
                <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gray-200"></div>
              </div>
            </StaggerItem>
            <StaggerItem direction="up">
              <div className="text-center relative">
                <motion.div
                  className="w-16 h-16 bg-purple-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg"
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  2
                </motion.div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">เลือกข้อสอบ</h3>
                <p className="text-gray-600">เลือกหมวดหมู่และชุดข้อสอบที่ต้องการฝึก</p>
                <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gray-200"></div>
              </div>
            </StaggerItem>
            <StaggerItem direction="up">
              <div className="text-center relative">
                <motion.div
                  className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-6 shadow-lg"
                  whileHover={{ scale: 1.1, rotate: 10 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  3
                </motion.div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">ฝึกและพัฒนา</h3>
                <p className="text-gray-600">ทำข้อสอบ รับ feedback และพัฒนาตัวเองอย่างต่อเนื่อง</p>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* Exam Categories Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              หมวดหมู่ข้อสอบยอดนิยม
            </h2>
            <p className="text-xl text-gray-600">
              ครอบคลุมทุกการสอบที่คุณต้องการ
            </p>
          </FadeIn>

          <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" staggerDelay={0.08}>
            <StaggerItem direction="up">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/register"
                  className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition flex items-center group block"
                >
                  <div className="p-4 bg-indigo-100 rounded-xl mr-4 group-hover:bg-indigo-600 transition">
                    <Shield className="w-6 h-6 text-indigo-600 group-hover:text-white transition" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                      ข้อสอบราชการ (ก.พ.)
                    </h3>
                    <p className="text-sm text-gray-500">5,000+ ข้อ</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                </Link>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/register"
                  className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition flex items-center group block"
                >
                  <div className="p-4 bg-purple-100 rounded-xl mr-4 group-hover:bg-purple-600 transition">
                    <FileQuestion className="w-6 h-6 text-purple-600 group-hover:text-white transition" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                      ข้อสอบ TOEIC
                    </h3>
                    <p className="text-sm text-gray-500">3,000+ ข้อ</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                </Link>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/register"
                  className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition flex items-center group block"
                >
                  <div className="p-4 bg-green-100 rounded-xl mr-4 group-hover:bg-green-600 transition">
                    <BarChart3 className="w-6 h-6 text-green-600 group-hover:text-white transition" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                      ข้อสอบ GAT/PAT
                    </h3>
                    <p className="text-sm text-gray-500">4,500+ ข้อ</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                </Link>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/register"
                  className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition flex items-center group block"
                >
                  <div className="p-4 bg-orange-100 rounded-xl mr-4 group-hover:bg-orange-600 transition">
                    <BookOpen className="w-6 h-6 text-orange-600 group-hover:text-white transition" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                      ข้อสอบ O-NET
                    </h3>
                    <p className="text-sm text-gray-500">6,000+ ข้อ</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                </Link>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/register"
                  className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition flex items-center group block"
                >
                  <div className="p-4 bg-red-100 rounded-xl mr-4 group-hover:bg-red-600 transition">
                    <CheckCircle className="w-6 h-6 text-red-600 group-hover:text-white transition" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                      ข้อสอบใบขับขี่
                    </h3>
                    <p className="text-sm text-gray-500">1,500+ ข้อ</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                </Link>
              </motion.div>
            </StaggerItem>
            <StaggerItem direction="up">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Link
                  href="/register"
                  className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition flex items-center group block"
                >
                  <div className="p-4 bg-gray-100 rounded-xl mr-4 group-hover:bg-gray-600 transition">
                    <Target className="w-6 h-6 text-gray-600 group-hover:text-white transition" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition">
                      ข้อสอบอื่นๆ
                    </h3>
                    <p className="text-sm text-gray-500">10,000+ ข้อ</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition" />
                </Link>
              </motion.div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              เสียงจากผู้ใช้งานจริง
            </h2>
            <p className="text-xl text-gray-600">
              ดูว่าผู้ใช้คนอื่นๆ พูดถึงเราอย่างไร
            </p>
          </FadeIn>

          <StaggerContainer className="grid md:grid-cols-3 gap-8" staggerDelay={0.15}>
            {[
              {
                name: 'คุณสมชาย',
                role: 'ผู้สอบผ่าน ก.พ. ปี 2567',
                content: 'ข้อสอบครอบคลุมมาก ทำให้ผมมั่นใจก่อนสอบจริง และสอบผ่านได้ในครั้งแรก!',
                rating: 5,
              },
              {
                name: 'คุณสมหญิง',
                role: 'นักศึกษาปริญญาตรี',
                content: 'ใช้ฝึก TOEIC ได้คะแนนเพิ่มขึ้นกว่า 200 คะแนน ขอบคุณ ExamPrep มากค่ะ',
                rating: 5,
              },
              {
                name: 'คุณวิชัย',
                role: 'ครูสอนพิเศษ',
                content: 'ใช้เป็นเครื่องมือสอนนักเรียน ระบบดีมาก วิเคราะห์จุดอ่อนได้ละเอียด',
                rating: 5,
              },
            ].map((testimonial, index) => (
              <StaggerItem key={index} direction="up">
                <motion.div
                  className="bg-gray-50 p-8 rounded-2xl"
                  whileHover={{ y: -5 }}
                >
                  <div className="flex mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 }}
                      >
                        <Star className="w-5 h-5 text-yellow-400 fill-current" />
                      </motion.div>
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6 italic">&ldquo;{testimonial.content}&rdquo;</p>
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold mr-4">
                      {testimonial.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{testimonial.name}</div>
                      <div className="text-sm text-gray-500">{testimonial.role}</div>
                    </div>
                  </div>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-indigo-600 to-purple-600 py-20">
        <FadeIn className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-white mb-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            พร้อมที่จะเริ่มต้นเส้นทางสู่ความสำเร็จ?
          </motion.h2>
          <motion.p
            className="text-xl text-indigo-100 mb-8 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            เข้าร่วมกับนักเรียนกว่า 10,000 คนที่กำลังพัฒนาผลการสอบของตน
          </motion.p>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Link
              href="/register"
              className="inline-block bg-white text-indigo-600 px-10 py-4 rounded-xl text-lg font-semibold hover:bg-gray-100 transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              สมัครสมาชิกฟรี
            </Link>
          </motion.div>
          <motion.p
            className="text-indigo-200 mt-4 text-sm"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            ไม่ต้องใช้บัตรเครดิต • ยกเลิกได้ทุกเมื่อ
          </motion.p>
        </FadeIn>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-white font-bold text-lg mb-4">ExamPrep</h3>
              <p className="text-sm">
                แพลตฟอร์มฝึกสอบออนไลน์ที่ช่วยให้คุณประสบความสำเร็จในทุกการสอบ
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">ลิงก์ด่วน</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/" className="hover:text-white transition">หน้าแรก</Link></li>
                <li><Link href="/blogs" className="hover:text-white transition">บทความ</Link></li>
                <li><Link href="/register" className="hover:text-white transition">สมัครสมาชิก</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">ช่วยเหลือ</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="hover:text-white transition">วิธีใช้งาน</Link></li>
                <li><Link href="#" className="hover:text-white transition">คำถามที่พบบ่อย</Link></li>
                <li><Link href="#" className="hover:text-white transition">ติดต่อเรา</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">ติดตามเรา</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="hover:text-white transition">Facebook</Link></li>
                <li><Link href="#" className="hover:text-white transition">Line</Link></li>
                <li><Link href="#" className="hover:text-white transition">Twitter</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2024 ExamPrep. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
