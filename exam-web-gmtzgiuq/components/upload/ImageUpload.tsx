'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  onUpload?: (file: File) => Promise<string>;
  className?: string;
  /**
   * กด X แล้วลบไฟล์บนเซิร์ฟเวอร์ทันที (ค่าเดิม true) — ฟอร์มข้อสอบส่ง false แล้วจัดการเอง
   * เพราะรูปที่บันทึกในข้อสอบแล้วต้องให้ API ลบหลังกดบันทึก ไม่งั้นกดยกเลิกแล้วรูปหาย
   */
  deleteOnRemove?: boolean;
  /** แสดงช่อง "หรือใส่ URL รูปภาพ" (ค่าเดิม true) */
  showUrlInput?: boolean;
  /** แบบเล็ก (ปุ่ม "เพิ่มรูป" / รูปย่อพร้อมปุ่มเปลี่ยน-ลบ) ใช้กับรูปในตัวเลือก */
  compact?: boolean;
  /**
   * เรียกเมื่ออัปโหลดสำเร็จ (ก่อน onChange) — แยก URL ที่ได้จาก POST /upload ออกจาก URL ที่พิมพ์เอง
   * ฟอร์มข้อสอบใช้จำว่ารูปไหนลบไฟล์ทิ้งได้
   */
  onUploaded?: (url: string) => void;
  /** ปิดการอัป/เปลี่ยน/ลบ (เช่นระหว่างบันทึก) */
  disabled?: boolean;
  /** ชื่อรูปแบบ compact ใช้ใน alt/aria-label เช่น "รูปตัวเลือก A" → ปุ่ม "เพิ่มรูปตัวเลือก A" */
  label?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ImageUpload({
  value,
  onChange,
  onUpload,
  className = '',
  deleteOnRemove = true,
  showUrlInput = true,
  compact = false,
  label = 'รูป',
  onUploaded,
  disabled = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error('ขนาดไฟล์ต้องไม่เกิน 5MB');
        return;
      }

      setUploading(true);

      try {
        if (onUpload) {
          const url = await onUpload(file);
          onUploaded?.(url);
          onChange(url);
        } else {
          // Default upload to backend
          const formData = new FormData();
          formData.append('file', file);

          const token = localStorage.getItem('token');
          const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Upload failed');
          }

          const data = await response.json();
          onUploaded?.(data.url);
          onChange(data.url);
        }

        toast.success('อัพโหลดรูปภาพสำเร็จ');
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('อัพโหลดรูปภาพไม่สำเร็จ');
      } finally {
        setUploading(false);
      }
    },
    [onChange, onUpload, onUploaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleRemove = useCallback(async () => {
    // Delete from server if it's a local upload URL
    if (deleteOnRemove && value && value.includes('/uploads/')) {
      try {
        // Extract filename from URL like http://localhost:3001/uploads/abc.jpg
        const filename = value.split('/uploads/').pop();
        if (filename) {
          const token = localStorage.getItem('token');
          const res = await fetch(`${API_URL}/upload/${filename}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (!res.ok) {
            console.error('Delete failed:', res.status);
          }
        }
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    }

    onChange('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onChange, value, deleteOnRemove]);

  if (compact) {
    return (
      <div className={className}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          aria-label={`เลือกไฟล์${label}`}
        />
        {value ? (
          <div className="inline-flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="h-20 max-w-[10rem] w-auto object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-100"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || disabled}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition disabled:opacity-50"
                title="เปลี่ยนรูป"
                aria-label={`เปลี่ยน${label}`}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading || disabled}
                className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition disabled:opacity-50"
                title="ลบรูป"
                aria-label={`ลบ${label}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            disabled={uploading || disabled}
            aria-label={`เพิ่ม${label}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed text-xs transition disabled:opacity-60 ${
              dragOver
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
                : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
            {uploading ? 'กำลังอัพโหลด...' : 'เพิ่มรูป'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt="Uploaded"
            className="w-full h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="p-2 bg-white dark:bg-gray-800 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-100"
              title="เปลี่ยนรูป"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="p-2 bg-white dark:bg-gray-800 rounded-full text-red-600 dark:text-red-400 hover:bg-red-50"
              title="ลบรูป"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition
            ${dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400'}
            ${uploading || disabled ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          {uploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400 animate-spin mb-2" />
              <p className="text-gray-600 dark:text-gray-400">กำลังอัพโหลด...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ImageIcon className="w-10 h-10 text-gray-400 dark:text-gray-500 mb-2" />
              <p className="text-gray-600 dark:text-gray-400 mb-1">
                ลากไฟล์มาวางที่นี่ หรือ <span className="text-indigo-600 dark:text-indigo-400">คลิกเพื่อเลือก</span>
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">PNG, JPG, GIF (สูงสุด 5MB)</p>
            </div>
          )}
        </div>
      )}

      {/* URL Input fallback */}
      {showUrlInput && (
      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          หรือใส่ URL รูปภาพ
        </label>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          placeholder="https://example.com/image.jpg"
        />
      </div>
      )}
    </div>
  );
}
