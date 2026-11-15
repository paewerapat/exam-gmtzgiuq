import {
  moveSet,
  effectiveProgress,
  isStalePreviewProgress,
  normalizeExamPredicted,
  normalizePredictedProgress,
  normalizePredictedSet,
  parsePreviewText,
  predictedErrorMessage,
  previewBarText,
  previewCounts,
  previewUpgradeText,
  recallPredicted,
  rememberPredicted,
  setAction,
  setBadges,
  setDraftError,
  setSubLine,
  upgradeHref,
  validateSeriesDraft,
  type PredictedSetSummary,
  type SeriesDraft,
} from './predicted';
import { ApiError, isPredictedLockedError, predictedLockedVenueKey } from './api/apiError';

const set = (patch: Partial<PredictedSetSummary> = {}): PredictedSetSummary => ({
  setNo: 1,
  examId: 'e1',
  title: 'ชุด 1',
  questionCount: 40,
  durationMinutes: 90,
  access: 'pro',
  previewCount: null,
  viewerAccess: 'locked',
  myProgress: null,
  status: 'published',
  ...patch,
});

describe('แถวชุด: ป้าย / บรรทัดรอง / ปุ่ม (task 22)', () => {
  it('ป้าย: preview → Preview (+ Pro ถ้าเป็นชุด pro) / pro ล็อก → Pro / ทำได้เต็ม → ไม่มีป้าย', () => {
    expect(setBadges(set({ access: 'free', viewerAccess: 'preview', previewCount: 20 }))).toEqual(['preview']);
    expect(setBadges(set({ access: 'pro', viewerAccess: 'preview', previewCount: 20 }))).toEqual(['preview', 'pro']);
    expect(setBadges(set({ access: 'pro', viewerAccess: 'locked' }))).toEqual(['pro']);
    expect(setBadges(set({ access: 'pro', viewerAccess: 'full' }))).toEqual([]);
    expect(setBadges(set({ access: 'free', viewerAccess: 'full' }))).toEqual([]);
  });

  it('บรรทัดรอง: preview → "Preview X ข้อ จากทั้งหมด Y ข้อ" / อื่น ๆ → "Y ข้อ"', () => {
    expect(setSubLine(set({ viewerAccess: 'preview', previewCount: 20 }))).toBe('Preview 20 ข้อ จากทั้งหมด 40 ข้อ');
    expect(setSubLine(set({ viewerAccess: 'full', previewCount: 20 }))).toBe('40 ข้อ');
    expect(setSubLine(set({ viewerAccess: 'locked' }))).toBe('40 ข้อ');
    expect(setSubLine(set({ questionCount: 1200, viewerAccess: 'full' }))).toBe('1,200 ข้อ');
  });

  it('ปุ่ม: locked → Unlock /upgrade?venue= / ชุด free หรือ preview → Free / pro เต็ม → เริ่มทำ', () => {
    expect(setAction(set(), 'netsat')).toEqual({
      label: 'Unlock',
      href: '/upgrade?venue=netsat',
      variant: 'unlock',
    });
    expect(setAction(set(), null)?.href).toBe('/upgrade');
    expect(setAction(set({ access: 'free', viewerAccess: 'full' }), 'netsat')).toEqual({
      label: 'Free',
      href: '/practice/exam/e1',
      variant: 'dark',
    });
    expect(setAction(set({ viewerAccess: 'preview', previewCount: 5 }), 'netsat')?.label).toBe('Free');
    expect(setAction(set({ viewerAccess: 'full' }), 'netsat')).toEqual({
      label: 'เริ่มทำ',
      href: '/practice/exam/e1',
      variant: 'primary',
    });
  });

  it('ปุ่ม: ค้าง → ทำต่อ ตาม mode (exam → /exam) / ส่งแล้ว → ดูผล (ประวัติ)', () => {
    const progress = {
      status: 'in_progress' as const,
      answered: 3,
      total: 10,
      scorePercent: null,
      attemptId: 'a1',
    };
    expect(
      setAction(
        set({
          viewerAccess: 'full',
          myProgress: { ...progress, mode: 'exam' },
        }),
        'x',
      ),
    ).toEqual({
      label: 'ทำต่อ',
      href: '/exam/e1',
      variant: 'outline',
    });
    expect(
      setAction(
        set({
          viewerAccess: 'preview',
          previewCount: 5,
          myProgress: { ...progress, mode: 'preview' },
        }),
        'x',
      )?.href,
    ).toBe('/practice/exam/e1');
    expect(
      setAction(
        set({
          viewerAccess: 'full',
          myProgress: {
            ...progress,
            mode: 'practice',
            status: 'completed',
            scorePercent: 80,
          },
        }),
        'x',
      ),
    ).toEqual({
      label: 'ดูผล',
      href: '/dashboard/history/a1',
      variant: 'outline',
    });
    // ล็อกแล้วแม้เคยทำ → Unlock (ไม่ให้ทำต่อ)
    expect(
      setAction(
        set({
          viewerAccess: 'locked',
          myProgress: { ...progress, mode: 'exam' },
        }),
        'x',
      )?.label,
    ).toBe('Unlock');
  });

  it('attempt Preview เดิม + ตอนนี้ทำได้เต็ม (ได้ Pro ภายหลัง) → ถือว่ายังไม่เริ่ม ทั้งส่งแล้วและค้าง (B1/Q1)', () => {
    const preview = {
      mode: 'preview' as const,
      answered: 5,
      total: 5,
      scorePercent: 60,
      attemptId: 'ap',
    };
    for (const status of ['completed', 'in_progress'] as const) {
      // ชุด pro → เริ่มทำ / ชุด free → Free (ไม่ใช่ ดูผล / ทำต่อ ของ attempt Preview)
      expect(setAction(set({ viewerAccess: 'full', myProgress: { ...preview, status } }), 'x')).toEqual({
        label: 'เริ่มทำ',
        href: '/practice/exam/e1',
        variant: 'primary',
      });
      expect(
        setAction(
          set({
            access: 'free',
            viewerAccess: 'full',
            myProgress: { ...preview, status },
          }),
          'x',
        ),
      ).toEqual({
        label: 'Free',
        href: '/practice/exam/e1',
        variant: 'dark',
      });
      expect(effectiveProgress(set({ viewerAccess: 'full', myProgress: { ...preview, status } }))).toBeNull();
    }
    // ยังทำได้แค่ Preview → attempt Preview ยังใช้อยู่ (ดูผล / ทำต่อที่หน้าฝึก)
    expect(
      setAction(
        set({
          viewerAccess: 'preview',
          previewCount: 5,
          myProgress: { ...preview, status: 'completed' },
        }),
        'x',
      ),
    ).toEqual({
      label: 'ดูผล',
      href: '/dashboard/history/ap',
      variant: 'outline',
    });
    // attempt เต็ม (practice) + full → ใช้ตามเดิม
    expect(
      setAction(
        set({
          viewerAccess: 'full',
          myProgress: { ...preview, mode: 'practice', status: 'completed' },
        }),
        'x',
      )?.label,
    ).toBe('ดูผล');
  });

  it('ชุดฉบับร่าง (แอดมิน) → ไม่มีปุ่ม แม้ทำได้เต็มหรือมี attempt ค้าง (Q4)', () => {
    expect(setAction(set({ status: 'draft', viewerAccess: 'full' }), 'x')).toBeNull();
    expect(
      setAction(
        set({
          status: 'draft',
          viewerAccess: 'full',
          myProgress: {
            status: 'in_progress',
            mode: 'practice',
            answered: 1,
            total: 4,
            scorePercent: null,
            attemptId: 'a',
          },
        }),
        'x',
      ),
    ).toBeNull();
  });

  it('upgradeHref encode key', () => {
    expect(upgradeHref('a level')).toBe('/upgrade?venue=a%20level');
    expect(upgradeHref(undefined)).toBe('/upgrade');
  });
});

describe('normalizer ทนข้อมูลขาด', () => {
  it('set: ไม่มี examId → null / viewerAccess ไม่รู้จัก → locked / access ไม่รู้จัก → pro / previewCount 0 → null', () => {
    expect(normalizePredictedSet({ setNo: 1 })).toBeNull();
    const s = normalizePredictedSet({ examId: 'e1', viewerAccess: 'weird', access: '?', previewCount: 0 }, 2);
    expect(s).toMatchObject({
      setNo: 3,
      viewerAccess: 'locked',
      access: 'pro',
      previewCount: null,
      questionCount: 0,
    });
    expect(
      normalizePredictedSet({
        examId: 'e1',
        previewCount: '12',
        questionCount: '40',
      }),
    ).toMatchObject({
      previewCount: 12,
      questionCount: 40,
    });
  });

  it('set status: ไม่ส่ง / published → published, draft (ส่งให้แอดมิน) → draft', () => {
    expect(normalizePredictedSet({ examId: 'e1' })?.status).toBe('published');
    expect(normalizePredictedSet({ examId: 'e1', status: 'published' })?.status).toBe('published');
    expect(normalizePredictedSet({ examId: 'e1', status: 'draft' })?.status).toBe('draft');
  });

  it('myProgress: mode preview/exam/practice, ไม่มี attemptId → null, score ถูกจำกัด 0–100', () => {
    expect(normalizePredictedProgress({ status: 'completed', attemptId: '' })).toBeNull();
    expect(
      normalizePredictedProgress({
        status: 'in_progress',
        mode: 'preview',
        attemptId: 'a',
        answered: 2,
        total: 5,
      }),
    ).toEqual({
      status: 'in_progress',
      mode: 'preview',
      answered: 2,
      total: 5,
      scorePercent: null,
      attemptId: 'a',
    });
    expect(
      normalizePredictedProgress({
        status: 'completed',
        attemptId: 'a',
        scorePercent: 140,
      })?.scorePercent,
    ).toBe(100);
    expect(normalizePredictedProgress({ status: 'completed', attemptId: 'a' })?.mode).toBe('practice');
  });

  it('predicted ของ GET /exams/:id: access ไม่ใช่ full/preview → null', () => {
    expect(normalizeExamPredicted(null)).toBeNull();
    expect(normalizeExamPredicted({ access: 'locked' })).toBeNull();
    expect(
      normalizeExamPredicted({
        access: 'preview',
        previewCount: 10,
        totalQuestions: 40,
        seriesId: 's',
        setNo: 2,
      }),
    ).toEqual({
      access: 'preview',
      previewCount: 10,
      totalQuestions: 40,
      seriesId: 's',
      setNo: 2,
      venueKey: null,
    });
    expect(normalizeExamPredicted({ access: 'full', venueKey: 'netsat' })).toMatchObject({
      access: 'full',
      previewCount: null,
      totalQuestions: 0,
      venueKey: 'netsat',
    });
  });

  it('previewCounts: X ไม่เกินจำนวนข้อที่ได้มา / Y อย่างน้อยเท่า X', () => {
    const info = normalizeExamPredicted({
      access: 'preview',
      previewCount: 10,
      totalQuestions: 40,
    })!;
    expect(previewCounts(info, 10)).toEqual({ answerable: 10, total: 40 });
    expect(previewCounts(info, 8)).toEqual({ answerable: 8, total: 40 });
    expect(previewCounts({ ...info, previewCount: null, totalQuestions: 0 }, 6)).toEqual({ answerable: 6, total: 6 });
    expect(previewBarText(10, 40)).toBe('Preview 10 จาก 40 ข้อ');
    expect(previewUpgradeText(40)).toBe('Upgrade เป็น Pro เพื่อทำครบ 40 ข้อ');
  });

  it('isStalePreviewProgress: ทำได้เต็มแล้ว + attempt mode preview หรือ session ที่สร้างตอน Preview → true (Q2/M1)', () => {
    const full = normalizeExamPredicted({ access: 'full', totalQuestions: 5 })!;
    const preview = normalizeExamPredicted({
      access: 'preview',
      previewCount: 2,
      totalQuestions: 5,
    })!;
    expect(isStalePreviewProgress(full, { mode: 'preview' })).toBe(true);
    expect(isStalePreviewProgress(full, {}, true)).toBe(true);
    // attempt/session เต็มที่มีข้อน้อยกว่า (แอดมินเพิ่มข้อภายหลัง) → ไม่ใช่ Preview ทำต่อได้
    expect(isStalePreviewProgress(full, { mode: 'practice' })).toBe(false);
    expect(isStalePreviewProgress(full, { mode: 'exam' })).toBe(false);
    expect(isStalePreviewProgress(full, {}, false)).toBe(false);
    // ยังเป็น Preview / ไม่ใช่ชุด Predicted → ไม่นับว่าค้างจาก Preview
    expect(isStalePreviewProgress(preview, { mode: 'preview' }, true)).toBe(false);
    expect(isStalePreviewProgress(null, { mode: 'preview' }, true)).toBe(false);
  });

  it('จำ/อ่านข้อมูล predicted ต่อ examId (null = ลบ) และ storage พัง → null', () => {
    localStorage.clear();
    const info = normalizeExamPredicted({
      access: 'preview',
      previewCount: 5,
      totalQuestions: 20,
    });
    rememberPredicted('e1', info);
    expect(recallPredicted('e1')).toEqual(info);
    expect(recallPredicted('e2')).toBeNull();
    rememberPredicted('e1', null);
    expect(recallPredicted('e1')).toBeNull();
    localStorage.setItem('predicted_exam_info_e3', '{oops');
    expect(recallPredicted('e3')).toBeNull();
  });
});

describe('403 PREDICTED_LOCKED', () => {
  it('แยกจาก EXAM_LOCKED และอ่าน venueKey จาก body ถ้ามี', () => {
    const err = new ApiError('ล็อก', 403, 'PREDICTED_LOCKED', {
      venueKey: 'netsat',
    });
    expect(isPredictedLockedError(err)).toBe(true);
    expect(predictedLockedVenueKey(err)).toBe('netsat');
    expect(predictedLockedVenueKey(new ApiError('ล็อก', 403, 'PREDICTED_LOCKED'))).toBeNull();
    expect(isPredictedLockedError(new ApiError('ล็อก', 403, 'EXAM_LOCKED'))).toBe(false);
    expect(isPredictedLockedError(new ApiError('x', 400, 'PREDICTED_LOCKED'))).toBe(false);
  });

  it('predictedErrorMessage: ข้อความไทยจาก API / อังกฤษ → fallback', () => {
    expect(predictedErrorMessage(new ApiError('ชุดนี้อยู่ในซีรีส์อื่นแล้ว', 409), 'x')).toBe('ชุดนี้อยู่ในซีรีส์อื่นแล้ว');
    expect(predictedErrorMessage(new Error('Failed'), 'บันทึกไม่สำเร็จ')).toBe('บันทึกไม่สำเร็จ');
    expect(predictedErrorMessage(null, 'บันทึกไม่สำเร็จ')).toBe('บันทึกไม่สำเร็จ');
  });
});

describe('ฟอร์มซีรีส์ (แอดมิน)', () => {
  const draft = (patch: Partial<SeriesDraft> = {}): SeriesDraft => ({
    title: 'NETSAT MATH JAN PREDICTED',
    description: '',
    venueId: 'v1',
    subjectId: '',
    color: '',
    sortOrder: '0',
    isActive: true,
    sets: [
      {
        examId: 'e1',
        title: 'ชุด 1',
        questionCount: 40,
        access: 'free',
        previewText: '20',
      },
    ],
    ...patch,
  });

  it('ช่อง Preview: ว่าง/0 = ไม่มี, ไม่ใช่จำนวนเต็มบวก → NaN', () => {
    expect(parsePreviewText('')).toBeNull();
    expect(parsePreviewText(' 0 ')).toBeNull();
    expect(parsePreviewText('12')).toBe(12);
    expect(parsePreviewText('1.5')).toBeNaN();
    expect(parsePreviewText('-3')).toBeNaN();
  });

  it('Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด (ไม่รู้จำนวนข้อ = ไม่เช็ก)', () => {
    const base = { examId: 'e', title: '', access: 'pro' as const };
    expect(setDraftError({ ...base, questionCount: 40, previewText: '40' })).toBe('Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด');
    expect(setDraftError({ ...base, questionCount: 40, previewText: '39' })).toBeNull();
    expect(setDraftError({ ...base, questionCount: 0, previewText: '99' })).toBeNull();
    expect(setDraftError({ ...base, questionCount: 40, previewText: 'abc' })).toMatch(/จำนวนเต็มบวก/);
  });

  it('validate: ชื่อ / สนาม / สี hex / ลำดับ / ชุดซ้ำ / preview', () => {
    expect(validateSeriesDraft(draft())).toBeNull();
    expect(validateSeriesDraft(draft({ title: '  ' }))).toBe('กรุณากรอกชื่อซีรีส์');
    expect(validateSeriesDraft(draft({ title: 'x'.repeat(151) }))).toMatch(/150/);
    expect(validateSeriesDraft(draft({ venueId: '' }))).toBe('กรุณาเลือกสนามสอบ');
    expect(validateSeriesDraft(draft({ color: 'red' }))).toMatch(/hex/);
    expect(validateSeriesDraft(draft({ color: '#4F46E5' }))).toBeNull();
    expect(validateSeriesDraft(draft({ color: '#abc' }))).toBeNull();
    expect(validateSeriesDraft(draft({ sortOrder: '1.5' }))).toBe('ลำดับต้องเป็นจำนวนเต็ม 0–1,000,000');
    expect(validateSeriesDraft(draft({ sortOrder: '-1' }))).toMatch(/^ลำดับ/);
    const many = Array.from({ length: 51 }, (_, i) => ({
      ...draft().sets[0],
      examId: `e${i}`,
      previewText: '',
    }));
    expect(validateSeriesDraft(draft({ sets: many }))).toBe('ซีรีส์หนึ่งมีได้ไม่เกิน 50 ชุด');
    const dup = draft().sets[0];
    expect(validateSeriesDraft(draft({ sets: [dup, dup] }))).toBe('ชุดที่ 2 ซ้ำกับชุดอื่นในซีรีส์');
    expect(validateSeriesDraft(draft({ sets: [{ ...dup, previewText: '40' }] }))).toBe(
      'ชุดที่ 1: Preview ต้องน้อยกว่าจำนวนข้อทั้งหมด',
    );
  });

  it('moveSet: สลับกับแถวข้างเคียง / ขอบ → คืนของเดิม', () => {
    expect(moveSet(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveSet(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    const arr = ['a', 'b'];
    expect(moveSet(arr, 0, -1)).toBe(arr);
    expect(moveSet(arr, 1, 1)).toBe(arr);
  });
});
