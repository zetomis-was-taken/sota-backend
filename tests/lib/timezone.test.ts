import { describe, expect, it } from 'vitest';
import {
  getTodayVN,
  isDateInPastVN,
  isTodayVN,
  isVisitDateNotFutureVN,
} from '../../src/lib/timezone';

describe('getTodayVN', () => {
  it('returns YYYY-MM-DD format', () => {
    const today = getTodayVN();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses Vietnam date across UTC midnight boundaries', () => {
    // 16:59:59.999 UTC is 23:59:59.999 in VN (UTC+7) -> same day
    const beforeMidnightVN = new Date('2026-11-20T16:59:59.999Z');
    expect(getTodayVN(beforeMidnightVN)).toBe('2026-11-20');

    // 17:00:00.000 UTC is 00:00:00.000 in VN (UTC+7) -> next day
    const atMidnightVN = new Date('2026-11-20T17:00:00.000Z');
    expect(getTodayVN(atMidnightVN)).toBe('2026-11-21');
  });

  it('handles year rollover correctly', () => {
    const endOfYearUTC = new Date('2026-12-31T16:59:59.999Z');
    expect(getTodayVN(endOfYearUTC)).toBe('2026-12-31');

    const newYearUTC = new Date('2026-12-31T17:00:00.000Z');
    expect(getTodayVN(newYearUTC)).toBe('2027-01-01');
  });
});

describe('isDateInPastVN', () => {
  const fixedNow = new Date('2026-11-20T10:00:00.000Z'); // 17:00 in VN on 2026-11-20

  it('returns false for today', () => {
    expect(isDateInPastVN('2026-11-20', fixedNow)).toBe(false);
  });

  it('returns true for yesterday', () => {
    expect(isDateInPastVN('2026-11-19', fixedNow)).toBe(true);
  });

  it('returns false for tomorrow', () => {
    expect(isDateInPastVN('2026-11-21', fixedNow)).toBe(false);
  });
});

describe('isVisitDateNotFutureVN', () => {
  const fixedNow = new Date('2026-11-20T10:00:00.000Z'); // 2026-11-20 in VN

  it('returns true for today (cannot cancel on the day of visit)', () => {
    expect(isVisitDateNotFutureVN('2026-11-20', fixedNow)).toBe(true);
  });

  it('returns true for past dates', () => {
    expect(isVisitDateNotFutureVN('2026-11-19', fixedNow)).toBe(true);
  });

  it('returns false for future dates (can cancel before visit date)', () => {
    expect(isVisitDateNotFutureVN('2026-11-21', fixedNow)).toBe(false);
  });
});

describe('isTodayVN', () => {
  const fixedNow = new Date('2026-11-20T10:00:00.000Z'); // 2026-11-20 in VN

  it('returns true for today', () => {
    expect(isTodayVN('2026-11-20', fixedNow)).toBe(true);
  });

  it('returns false for yesterday and tomorrow', () => {
    expect(isTodayVN('2026-11-19', fixedNow)).toBe(false);
    expect(isTodayVN('2026-11-21', fixedNow)).toBe(false);
  });
});
