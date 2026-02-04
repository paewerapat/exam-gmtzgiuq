'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface ImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  onUpload?: (file: File) => Promise<string>;
  className?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ImageUpload({
  value,
  onChange,
  onUpload,
  className = '',
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
    [onChange, onUpload]
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
    if (value && value.includes('/uploads/')) {
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
  }, [onChange, value]);

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
            className="w-full h-48 object-cover rounded-lg border border-gray-200"
          />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 bg-white rounded-full text-gray-700 hover:bg-gray-100"
              title="เปลี่ยนรูป"
            >
              <Upload className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 bg-white rounded-full text-red-600 hover:bg-red-50"
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
            ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}
            ${uploading ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          {uploading ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-2" />
              <p className="text-gray-600">กำลังอัพโหลด...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ImageIcon className="w-10 h-10 text-gray-400 mb-2" />
              <p className="text-gray-600 mb-1">
                ลากไฟล์มาวางที่นี่ หรือ <span className="text-indigo-600">คลิกเพื่อเลือก</span>
              </p>
              <p className="text-sm text-gray-400">PNG, JPG, GIF (สูงสุด 5MB)</p>
            </div>
          )}
        </div>
      )}

      {/* URL Input fallback */}
      <div className="mt-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          หรือใส่ URL รูปภาพ
        </label>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          placeholder="https://example.com/image.jpg"
        />
      </div>
    </div>
  );
}
