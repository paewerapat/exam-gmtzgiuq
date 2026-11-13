import Swal from 'sweetalert2';

const theme = () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

/** ยืนยันการกระทำที่ย้อนไม่ได้ (ข้อความแสดงแบบ text ไม่ผ่าน HTML) */
export async function confirmDanger(title: string, text: string, confirmButtonText: string): Promise<boolean> {
  const result = await Swal.fire({
    theme: theme(),
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#6b7280',
    reverseButtons: true,
    focusCancel: true,
  });
  return result.isConfirmed;
}

/** ยืนยันถอนสิทธิ์ + หมายเหตุ (ไม่บังคับ) → null = ยกเลิก */
export async function confirmRevoke(text: string): Promise<{ note: string } | null> {
  const result = await Swal.fire({
    theme: theme(),
    title: 'ถอนสิทธิ์สมาชิก?',
    text,
    icon: 'warning',
    input: 'text',
    inputLabel: 'หมายเหตุ (ไม่บังคับ)',
    inputAttributes: { maxlength: '255', 'aria-label': 'หมายเหตุการถอนสิทธิ์' },
    showCancelButton: true,
    confirmButtonText: 'ถอนสิทธิ์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#6b7280',
    reverseButtons: true,
    focusCancel: true,
  });
  if (!result.isConfirmed) return null;
  return { note: typeof result.value === 'string' ? result.value : '' };
}
