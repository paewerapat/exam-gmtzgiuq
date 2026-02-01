'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  FileQuestion,
  CheckCircle,
  XCircle,
  BookOpen,
  Calculator,
  Globe,
  FlaskConical,
  Car,
  GraduationCap,
  FileText,
  HelpCircle,
} from 'lucide-react';
import FadeIn from '@/components/animations/FadeIn';

// Mock data
const mockQuestions = [
  {
    id: '1',
    question: 'ประเทศไทยมีกี่จังหวัด?',
    category: 'ความรู้ทั่วไป',
    difficulty: 'easy',
    type: 'multiple_choice',
    status: 'published',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    question: 'What is the capital of France?',
    category: 'TOEIC',
    difficulty: 'easy',
    type: 'multiple_choice',
    status: 'published',
    createdAt: '2024-01-16',
  },
  {
    id: '3',
    question: 'จงหาค่า x จากสมการ 2x + 5 = 15',
    category: 'คณิตศาสตร์',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'draft',
    createdAt: '2024-01-17',
  },
  {
    id: '4',
    question: 'รัฐธรรมนูญฉบับปัจจุบันประกาศใช้เมื่อใด?',
    category: 'ก.พ.',
    difficulty: 'hard',
    type: 'multiple_choice',
    status: 'published',
    createdAt: '2024-01-18',
  },
  {
    id: '5',
    question: 'เมื่อขับรถผ่านทางม้าลายและมีคนข้าม ควรปฏิบัติอย่างไร?',
    category: 'ใบขับขี่',
    difficulty: 'easy',
    type: 'multiple_choice',
    status: 'published',
    createdAt: '2024-01-19',
  },
  {
    id: '6',
    question: 'พันธะเคมีแบบโควาเลนต์คืออะไร?',
    category: 'วิทยาศาสตร์',
    difficulty: 'medium',
    type: 'multiple_choice',
    status: 'published',
    createdAt: '2024-01-20',
  },
];

const categories = [
  { id: 'all', name: 'ทั้งหมด', icon: FileQuestion, count: 6 },
  { id: 'ความรู้ทั่วไป', name: 'ความรู้ทั่วไป', icon: BookOpen, count: 1 },
  { id: 'ก.พ.', name: 'ข้อสอบ ก.พ.', icon: GraduationCap, count: 1 },
  { id: 'TOEIC', name: 'TOEIC', icon: Globe, count: 1 },
  { id: 'คณิตศาสตร์', name: 'คณิตศาสตร์', icon: Calculator, count: 1 },
  { id: 'วิทยาศาสตร์', name: 'วิทยาศาสตร์', icon: FlaskConical, count: 1 },
  { id: 'ใบขับขี่', name: 'ใบขับขี่', icon: Car, count: 1 },
  { id: 'GAT/PAT', name: 'GAT/PAT', icon: FileText, count: 0 },
  { id: 'O-NET', name: 'O-NET', icon: HelpCircle, count: 0 },
];

const difficulties = [
  { id: 'all', name: 'ทุกระดับ' },
  { id: 'easy', name: 'ง่าย' },
  { id: 'medium', name: 'ปานกลาง' },
  { id: 'hard', name: 'ยาก' },
];

const statuses = [
  { id: 'all', name: 'ทุกสถานะ' },
  { id: 'published', name: 'เผยแพร่' },
  { id: 'draft', name: 'แบบร่าง' },
];

const difficultyColors: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  hard: 'bg-red-100 text-red-700',
};

const difficultyLabels: Record<string, string> = {
  easy: 'ง่าย',
  medium: 'ปานกลาง',
  hard: 'ยาก',
};

export default function QuestionsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const filteredQuestions = mockQuestions.filter((q) => {
    const matchesSearch = q.question.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || q.category === selectedCategory;
    const matchesDifficulty = selectedDifficulty === 'all' || q.difficulty === selectedDifficulty;
    const matchesStatus = selectedStatus === 'all' || q.status === selectedStatus;
    return matchesSearch && matchesCategory && matchesDifficulty && matchesStatus;
  });

  return (
    <div className="flex gap-6">
      {/* Sidebar Filters */}
      <FadeIn className="w-64 flex-shrink-0">
        <div className="bg-white rounded-xl shadow-sm p-4 sticky top-4">
          {/* Categories */}
          <h3 className="font-semibold text-gray-900 mb-3">หมวดหมู่</h3>
          <div className="space-y-1 mb-6">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="w-4 h-4 mr-2" />
                    <span>{cat.name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      isSelected ? 'bg-indigo-200' : 'bg-gray-200'
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Difficulty */}
          <h3 className="font-semibold text-gray-900 mb-3">ระดับความยาก</h3>
          <div className="space-y-1 mb-6">
            {difficulties.map((diff) => {
              const isSelected = selectedDifficulty === diff.id;
              return (
                <button
                  key={diff.id}
                  onClick={() => setSelectedDifficulty(diff.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {diff.name}
                </button>
              );
            })}
          </div>

          {/* Status */}
          <h3 className="font-semibold text-gray-900 mb-3">สถานะ</h3>
          <div className="space-y-1">
            {statuses.map((status) => {
              const isSelected = selectedStatus === status.id;
              return (
                <button
                  key={status.id}
                  onClick={() => setSelectedStatus(status.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    isSelected
                      ? 'bg-indigo-100 text-indigo-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {status.name}
                </button>
              );
            })}
          </div>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedDifficulty('all');
              setSelectedStatus('all');
              setSearchTerm('');
            }}
            className="w-full mt-6 px-3 py-2 text-sm text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </FadeIn>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <FadeIn>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">จัดการโจทย์สอบ</h1>
              <p className="text-gray-600 text-sm mt-1">
                ทั้งหมด {mockQuestions.length} โจทย์ • แสดง {filteredQuestions.length} รายการ
              </p>
            </div>
            <Link
              href="/admin/questions/new"
              className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              สร้างโจทย์ใหม่
            </Link>
          </div>
        </FadeIn>

        {/* Search */}
        <FadeIn delay={0.1}>
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="ค้นหาโจทย์..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
        </FadeIn>

        {/* Questions List */}
        <FadeIn delay={0.2}>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    โจทย์
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    หมวดหมู่
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ระดับ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    จัดการ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredQuestions.map((question, index) => (
                  <motion.tr
                    key={question.id}
                    className="hover:bg-gray-50"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 line-clamp-1 max-w-sm">
                        {question.question}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{question.createdAt}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">
                        {question.category}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${difficultyColors[question.difficulty]}`}
                      >
                        {difficultyLabels[question.difficulty]}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {question.status === 'published' ? (
                        <span className="flex items-center text-green-600 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          เผยแพร่
                        </span>
                      ) : (
                        <span className="flex items-center text-gray-500 text-xs">
                          <XCircle className="w-3 h-3 mr-1" />
                          แบบร่าง
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end space-x-1">
                        <button className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                          <Eye className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/admin/questions/${question.id}/edit`}
                          className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        >
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>

            {filteredQuestions.length === 0 && (
              <div className="text-center py-12">
                <FileQuestion className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">ไม่พบโจทย์ที่ค้นหา</p>
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedDifficulty('all');
                    setSelectedStatus('all');
                    setSearchTerm('');
                  }}
                  className="mt-4 text-indigo-600 hover:text-indigo-700 text-sm"
                >
                  ล้างตัวกรอง
                </button>
              </div>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
