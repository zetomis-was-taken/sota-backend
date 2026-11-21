export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Returns today's date in Vietnam timezone as YYYY-MM-DD. */
export function getTodayVN(now = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: VN_TIMEZONE }).format(now);
}

/** Returns true if dateStr is strictly in the past compared to today in Vietnam. */
export function isDateInPastVN(dateStr: string, now = new Date()): boolean {
  return dateStr < getTodayVN(now);
}

/**
 * Returns true if dateStr is today or in the past in Vietnam.
 * Used for ticket cancellations (only allowed strictly before the visit date).
 */
export function isVisitDateNotFutureVN(dateStr: string, now = new Date()): boolean {
  return dateStr <= getTodayVN(now);
}

/** Returns true if dateStr is today's date in Vietnam. */
export function isTodayVN(dateStr: string, now = new Date()): boolean {
  return dateStr === getTodayVN(now);
}
