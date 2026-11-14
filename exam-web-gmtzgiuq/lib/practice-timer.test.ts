import {
  buildPracticeTimer,
  defaultTimerMinutes,
  parseTimerMinutes,
  practiceTimerRemaining,
  totalActiveSeconds,
} from './practice-timer';

describe('practice-timer (task 21)', () => {
  it('totalActiveSeconds: รวม timePerQuestion โดยข้อที่เปิดอยู่ใช้ currentTimer', () => {
    const session = { questionIds: ['a', 'b', 'c'], currentIndex: 1, timePerQuestion: { a: 30, b: 5, c: 12 } };
    expect(totalActiveSeconds(session, 20)).toBe(30 + 20 + 12);
    expect(totalActiveSeconds({ ...session, timePerQuestion: {} }, 7)).toBe(7);
  });

  it('practiceTimerRemaining: นับถอยหลังจากเวลาที่ตั้ง ณ ตอนกด ไม่ติดลบ / นับขึ้น → null', () => {
    const down = { mode: 'down' as const, minutes: 2, autoSubmit: true, startTotalSec: 100 };
    expect(practiceTimerRemaining(down, 100)).toBe(120);
    expect(practiceTimerRemaining(down, 190)).toBe(30);
    expect(practiceTimerRemaining(down, 500)).toBe(0);
    expect(practiceTimerRemaining({ ...down, mode: 'up' }, 190)).toBeNull();
    expect(practiceTimerRemaining(null, 190)).toBeNull();
  });

  it('defaultTimerMinutes: เวลาสอบจริงของชุด ไม่มี/นอกช่วง → 60', () => {
    expect(defaultTimerMinutes(90)).toBe(90);
    expect(defaultTimerMinutes(null)).toBe(60);
    expect(defaultTimerMinutes(undefined)).toBe(60);
    expect(defaultTimerMinutes(900)).toBe(60);
  });

  it('parseTimerMinutes: จำนวนเต็ม 1–600 เท่านั้น', () => {
    expect(parseTimerMinutes('1')).toBe(1);
    expect(parseTimerMinutes(' 600 ')).toBe(600);
    expect(parseTimerMinutes('0')).toBeNull();
    expect(parseTimerMinutes('601')).toBeNull();
    expect(parseTimerMinutes('1.5')).toBeNull();
    expect(parseTimerMinutes('')).toBeNull();
    expect(parseTimerMinutes('-5')).toBeNull();
  });

  it('buildPracticeTimer: เก็บเวลารวมตอนกดเป็นจุดเริ่ม / นาทีผิด → 60', () => {
    expect(buildPracticeTimer({ mode: 'down', minutes: 30, autoSubmit: false }, 75)).toEqual({
      mode: 'down',
      minutes: 30,
      autoSubmit: false,
      startTotalSec: 75,
    });
    expect(buildPracticeTimer({ mode: 'down', minutes: 0, autoSubmit: true }, -3)).toMatchObject({
      minutes: 60,
      startTotalSec: 0,
    });
  });
});
