// QA task 07 — ImageUpload: ค่าเดิม (blog/banner) ลบไฟล์ทันทีเมื่อกด X; ฟอร์มข้อสอบ (deleteOnRemove=false) ไม่ลบ
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageUpload from './ImageUpload';

const URL_SAVED = 'http://localhost:3001/uploads/1700000000000-0123456789abcdef.png';

describe('ImageUpload deleteOnRemove', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    localStorage.setItem('token', 'tkn');
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('ค่าเดิม: กดลบรูป → DELETE /upload/<ไฟล์> พร้อม token แล้ว onChange("")', async () => {
    const onChange = jest.fn();
    render(<ImageUpload value={URL_SAVED} onChange={onChange} />);
    await userEvent.click(screen.getByTitle('ลบรูป'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/upload\/1700000000000-0123456789abcdef\.png$/);
    expect(init).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer tkn' } });
    // ยังมีช่อง URL ตามเดิม
    expect(screen.queryByText('หรือใส่ URL รูปภาพ')).not.toBeNull();
  });

  it('deleteOnRemove=false: กดลบรูป → ไม่เรียก API แต่ onChange("")', async () => {
    const onChange = jest.fn();
    render(<ImageUpload value={URL_SAVED} onChange={onChange} deleteOnRemove={false} showUrlInput={false} />);
    await userEvent.click(screen.getByTitle('ลบรูป'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText('หรือใส่ URL รูปภาพ')).toBeNull();
  });

  it('compact + deleteOnRemove=false: ปุ่มตาม label และลบไม่เรียก API', async () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ImageUpload compact value="" onChange={onChange} deleteOnRemove={false} label="รูปตัวเลือก C" />,
    );
    expect(screen.getByRole('button', { name: 'เพิ่มรูปตัวเลือก C' })).toBeTruthy();
    rerender(<ImageUpload compact value={URL_SAVED} onChange={onChange} deleteOnRemove={false} label="รูปตัวเลือก C" />);
    expect(screen.getByAltText('รูปตัวเลือก C').getAttribute('src')).toBe(URL_SAVED);
    await userEvent.click(screen.getByRole('button', { name: 'ลบรูปตัวเลือก C' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('รูปภายนอก (ไม่ใช่ /uploads/) ค่าเดิมก็ไม่เรียก DELETE', async () => {
    const onChange = jest.fn();
    render(<ImageUpload value="https://example.com/a.png" onChange={onChange} />);
    await userEvent.click(screen.getByTitle('ลบรูป'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(''));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
