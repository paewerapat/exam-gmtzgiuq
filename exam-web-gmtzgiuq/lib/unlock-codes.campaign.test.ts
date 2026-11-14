import { proRedeemErrorMessage, redeemErrorMessage } from './unlock-codes';
import { ApiError, campaignClosedCode } from './api/apiError';

describe('ข้อความเมื่อชุดอยู่นอกช่วงแคมเปญ (task 21)', () => {
  it('redeem 400 CAMPAIGN_NOT_OPEN / CAMPAIGN_ENDED → ข้อความไทยของเว็บ (รวมโค้ด Pro ที่กรอกในหน้าชุด)', () => {
    expect(redeemErrorMessage('CAMPAIGN_NOT_OPEN')).toBe('แคมเปญนี้ยังไม่เปิด กรอกโค้ดได้เมื่อแคมเปญเปิด');
    expect(redeemErrorMessage('CAMPAIGN_ENDED')).toBe('แคมเปญนี้จบแล้ว กรอกโค้ดไม่ได้');
    expect(proRedeemErrorMessage('CAMPAIGN_ENDED')).toBe('แคมเปญนี้จบแล้ว กรอกโค้ดไม่ได้');
  });

  it('campaignClosedCode แยกเฉพาะสองรหัสนี้', () => {
    expect(campaignClosedCode(new ApiError('x', 403, 'CAMPAIGN_NOT_OPEN'))).toBe('CAMPAIGN_NOT_OPEN');
    expect(campaignClosedCode(new ApiError('x', 403, 'CAMPAIGN_ENDED'))).toBe('CAMPAIGN_ENDED');
    expect(campaignClosedCode(new ApiError('x', 403, 'EXAM_LOCKED'))).toBeNull();
    expect(campaignClosedCode(new Error('x'))).toBeNull();
  });
});
