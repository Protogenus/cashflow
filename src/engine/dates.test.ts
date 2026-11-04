import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  daysInMonth,
  formatISODate,
  isLeapYear,
  isWeekend,
  parseISODate,
  shiftBusinessDay,
  toLocalDate,
  todayISO,
} from './dates';

describe('parseISODate', () => {
  it('parses a valid date into components', () => {
    expect(parseISODate('2026-11-03')).toEqual({ y: 2026, m: 11, d: 3 });
  });
  it('rejects malformed input', () => {
    expect(() => parseISODate('2026-13-01')).toThrow();
    expect(() => parseISODate('2023-02-29')).toThrow(); // not a leap year
    expect(() => parseISODate('not-a-date')).toThrow();
  });
  it('accepts Feb 29 in leap years', () => {
    expect(parseISODate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
  });
});

describe('isLeapYear', () => {
  it('handles century rules', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe('addDays (wall-clock, DST-safe)', () => {
  it('steps over the US spring-forward boundary without losing a day', () => {
    // DST starts 2026-03-08 in America/Chicago (23-hour day).
    const d = toLocalDate(parseISODate('2026-03-07'));
    expect(formatISODate(addDays(d, 1))).toBe('2026-03-08');
    expect(formatISODate(addDays(d, 2))).toBe('2026-03-09');
  });
  it('handles month and year rollover', () => {
    const d = toLocalDate(parseISODate('2026-12-31'));
    expect(formatISODate(addDays(d, 1))).toBe('2027-01-01');
    expect(formatISODate(addDays(d, -31))).toBe('2026-11-30');
  });
});

describe('addMonthsClamped', () => {
  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    const d = toLocalDate(parseISODate('2026-01-31'));
    expect(formatISODate(addMonthsClamped(d, 1))).toBe('2026-02-28');
  });
  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    const d = toLocalDate(parseISODate('2024-01-31'));
    expect(formatISODate(addMonthsClamped(d, 1))).toBe('2024-02-29');
  });
  it('preserves the day when the target month has it', () => {
    const d = toLocalDate(parseISODate('2026-01-15'));
    expect(formatISODate(addMonthsClamped(d, 2))).toBe('2026-03-15');
  });
  it('never degrades across a chain (31st stays 31st in long months)', () => {
    // The engine never chains off the last occurrence, but the helper itself
    // must not degrade either.
    const jan31 = toLocalDate(parseISODate('2026-01-31'));
    expect(formatISODate(addMonthsClamped(jan31, 2))).toBe('2026-03-31');
  });
});

describe('shiftBusinessDay', () => {
  it('following: Sat -> Monday, Sun -> Monday', () => {
    expect(formatISODate(shiftBusinessDay(toLocalDate(parseISODate('2026-10-31')), 'following'))).toBe(
      '2026-11-02',
    ); // Saturday -> Monday
    expect(formatISODate(shiftBusinessDay(toLocalDate(parseISODate('2026-11-01')), 'following'))).toBe(
      '2026-11-02',
    ); // Sunday -> Monday
  });
  it('preceding: Sat -> Friday, Sun -> Friday', () => {
    expect(formatISODate(shiftBusinessDay(toLocalDate(parseISODate('2026-10-31')), 'preceding'))).toBe(
      '2026-10-30',
    );
    expect(formatISODate(shiftBusinessDay(toLocalDate(parseISODate('2026-11-01')), 'preceding'))).toBe(
      '2026-10-30',
    );
  });
  it('leaves weekdays and "none" untouched', () => {
    const friday = toLocalDate(parseISODate('2026-10-30'));
    expect(formatISODate(shiftBusinessDay(friday, 'following'))).toBe('2026-10-30');
    expect(formatISODate(shiftBusinessDay(friday, 'preceding'))).toBe('2026-10-30');
    const sat = toLocalDate(parseISODate('2026-10-31'));
    expect(formatISODate(shiftBusinessDay(sat, 'none'))).toBe('2026-10-31');
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days across DST', () => {
    const a = toLocalDate(parseISODate('2026-03-07'));
    const b = toLocalDate(parseISODate('2026-03-09'));
    expect(daysBetween(a, b)).toBe(2);
  });
});

describe('misc', () => {
  it('isWeekend flags Sat/Sun only', () => {
    expect(isWeekend(toLocalDate(parseISODate('2026-10-31')))).toBe(true);
    expect(isWeekend(toLocalDate(parseISODate('2026-11-01')))).toBe(true);
    expect(isWeekend(toLocalDate(parseISODate('2026-11-02')))).toBe(false);
  });
  it('daysInMonth knows February', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });
  it('todayISO returns a valid local date', () => {
    expect(() => parseISODate(todayISO())).not.toThrow();
  });
});
