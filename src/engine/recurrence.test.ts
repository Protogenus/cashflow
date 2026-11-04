import { describe, expect, it } from 'vitest';
import {
  describeFrequency,
  expandRecurrence,
  nextOccurrenceDate,
  type OccurrenceInput,
} from './recurrence';
import type { ISODate, Recurrence } from './types';

const base: Omit<OccurrenceInput, 'recurrence'> = {
  nodeId: 'n1',
  name: 'Paycheck',
  kind: 'income',
  amountCents: 185000,
};

function expand(recurrence: Recurrence, start: ISODate, horizon: number) {
  return expandRecurrence({ ...base, recurrence }, start, horizon).map((o) => o.date);
}

function noExc(freq: Recurrence['frequency'], businessDay: Recurrence['businessDay'] = 'none'): Recurrence {
  return { frequency: freq, businessDay, exceptions: {} };
}

describe('biweekly expansion', () => {
  it('lands every 14 days from the anchor over 90 days', () => {
    // Anchor Friday 2026-10-30; start Tue 2026-11-03. First occurrence >= start: 2026-11-13.
    const dates = expand(noExc({ kind: 'biweekly', anchor: '2026-10-30' }), '2026-11-03', 90);
    expect(dates).toEqual([
      '2026-11-13',
      '2026-11-27',
      '2026-12-11',
      '2026-12-25',
      '2027-01-08',
      '2027-01-22',
    ]);
  });

  it('includes the anchor itself when the horizon starts on it', () => {
    const dates = expand(noExc({ kind: 'biweekly', anchor: '2026-11-03' }), '2026-11-03', 30);
    expect(dates[0]).toBe('2026-11-03');
    expect(dates[1]).toBe('2026-11-17');
  });

  it('handles anchors far in the past (negative k)', () => {
    const dates = expand(noExc({ kind: 'biweekly', anchor: '2025-01-03' }), '2026-11-03', 30);
    // 2025-01-03 + 14k >= 2026-11-03 → k=47 → 2026-11-06
    expect(dates[0]).toBe('2026-11-06');
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T12:00:00');
      const cur = new Date(dates[i] + 'T12:00:00');
      expect(Math.round((cur.getTime() - prev.getTime()) / 86400000)).toBe(14);
    }
  });
});

describe('monthly-on-31st clamp (DECISIONS.md)', () => {
  it('fires Feb 28 in a non-leap year and never skips', () => {
    const dates = expand(noExc({ kind: 'monthly', dayOfMonth: 31 }), '2026-01-15', 400);
    expect(dates.slice(0, 5)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
    expect(dates).toHaveLength(13); // every month fires
    expect(dates.every((d) => d.startsWith('2026') || d.startsWith('2027'))).toBe(true);
  });

  it('fires Feb 29 in a leap year', () => {
    const dates = expand(noExc({ kind: 'monthly', dayOfMonth: 31 }), '2024-01-15', 400);
    expect(dates.slice(0, 3)).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
  });

  it('does not degrade: March stays the 31st after a clamped February', () => {
    const dates = expand(noExc({ kind: 'monthly', dayOfMonth: 31 }), '2026-02-01', 90);
    expect(dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });
});

describe('Feb 29 series', () => {
  it('fires only in leap years (clamped to Feb 28 otherwise)', () => {
    const dates = expand(noExc({ kind: 'monthly', dayOfMonth: 29 }), '2023-01-01', 730);
    const febs = dates.filter((d) => d.slice(5, 7) === '02');
    expect(febs).toEqual(['2023-02-28', '2024-02-29']);
    expect(dates).not.toContain('2023-02-29'); // that date never exists
  });
});

describe('weekend adjustment', () => {
  it('following moves a Sunday occurrence to Monday', () => {
    // 2026-11-01 is a Sunday.
    const dates = expand(noExc({ kind: 'monthly', dayOfMonth: 1 }, 'following'), '2026-10-15', 60);
    expect(dates).toContain('2026-11-02');
    expect(dates).not.toContain('2026-11-01');
  });

  it('preceding moves a Sunday occurrence to Friday', () => {
    const dates = expand(noExc({ kind: 'monthly', dayOfMonth: 1 }, 'preceding'), '2026-10-15', 60);
    expect(dates).toContain('2026-10-30');
    expect(dates).not.toContain('2026-11-01');
  });

  it('applies per occurrence independently', () => {
    // Anchor Friday 2026-10-30 biweekly; 2026-11-13 is a Friday (no shift),
    // so only weekend-landing occurrences move.
    const dates = expand(
      noExc({ kind: 'biweekly', anchor: '2026-10-23' }, 'following'),
      '2026-10-23',
      60,
    );
    // 2026-10-23 Fri, 11-06 Fri, 11-20 Fri, 12-04 Fri, 12-18 Fri — none land on weekends
    expect(dates).toEqual(['2026-10-23', '2026-11-06', '2026-11-20', '2026-12-04', '2026-12-18']);
  });
});

describe('semimonthly vs biweekly', () => {
  it('are distinct: 24/yr fixed calendar days vs 26/yr drifting cadence', () => {
    const semi = expand(noExc({ kind: 'semimonthly', days: [1, 15] }), '2026-01-01', 90);
    expect(semi).toEqual([
      '2026-01-01',
      '2026-01-15',
      '2026-02-01',
      '2026-02-15',
      '2026-03-01',
      '2026-03-15',
    ]);
    const bi = expand(noExc({ kind: 'biweekly', anchor: '2026-01-02' }), '2026-01-01', 90);
    expect(bi).toEqual([
      '2026-01-02',
      '2026-01-16',
      '2026-01-30',
      '2026-02-13',
      '2026-02-27',
      '2026-03-13',
      '2026-03-27',
    ]);
    expect(semi).not.toEqual(bi);
    expect(semi).toHaveLength(6); // 24/yr pace
    expect(bi).toHaveLength(7); // 26/yr pace
  });
});

describe('exceptions (RECURRENCE-ID pattern)', () => {
  const weekly: Recurrence = {
    frequency: { kind: 'weekly', anchor: '2026-11-03' },
    businessDay: 'none',
    exceptions: {
      '2026-11-10': { skipped: true },
      '2026-11-17': { newDate: '2026-11-18' },
      '2026-11-24': { newAmountCents: 9999 },
    },
  };

  it('skips, moves, and re-amounts individual occurrences without breaking the series', () => {
    const occ = expandRecurrence({ ...base, recurrence: weekly }, '2026-11-03', 30);
    const dates = occ.map((o) => o.date);
    expect(dates).toContain('2026-11-03');
    expect(dates).not.toContain('2026-11-10'); // skipped
    expect(dates).not.toContain('2026-11-17'); // moved
    expect(dates).toContain('2026-11-18'); // moved-to date
    expect(dates).toContain('2026-12-01'); // series continues intact
    const changed = occ.find((o) => o.date === '2026-11-24')!;
    expect(changed.amountCents).toBe(9999);
    const normal = occ.find((o) => o.date === '2026-11-03')!;
    expect(normal.amountCents).toBe(185000);
  });
});

describe('endDate', () => {
  it('excludes occurrences after the end date', () => {
    const rec: Recurrence = {
      frequency: { kind: 'weekly', anchor: '2026-11-03' },
      businessDay: 'none',
      endDate: '2026-11-17',
      exceptions: {},
    };
    expect(expand(rec, '2026-11-03', 90)).toEqual(['2026-11-03', '2026-11-10', '2026-11-17']);
  });
});

describe('once', () => {
  it('fires exactly once inside the horizon', () => {
    const dates = expand(noExc({ kind: 'once', date: '2026-12-25' }), '2026-11-03', 90);
    expect(dates).toEqual(['2026-12-25']);
  });
  it('fires nothing outside the horizon', () => {
    expect(expand(noExc({ kind: 'once', date: '2027-06-01' }), '2026-11-03', 90)).toEqual([]);
  });
});

describe('nextOccurrenceDate', () => {
  it('returns the first occurrence on/after the date', () => {
    expect(
      nextOccurrenceDate(noExc({ kind: 'monthly', dayOfMonth: 15 }), '2026-11-03'),
    ).toBe('2026-11-15');
    expect(
      nextOccurrenceDate(noExc({ kind: 'monthly', dayOfMonth: 1 }), '2026-11-03'),
    ).toBe('2026-12-01');
  });
});

describe('describeFrequency', () => {
  it('states counts per RESEARCH.md §3', () => {
    expect(describeFrequency(noExc({ kind: 'weekly', anchor: '2026-11-03' }))).toBe('weekly · 52/yr');
    expect(describeFrequency(noExc({ kind: 'biweekly', anchor: '2026-11-03' }))).toBe(
      'biweekly · 26/yr',
    );
    expect(describeFrequency(noExc({ kind: 'semimonthly', days: [1, 15] }))).toBe(
      'semi-monthly (1st & 15th) · 24/yr',
    );
    expect(describeFrequency(noExc({ kind: 'monthly', dayOfMonth: 31 }))).toBe(
      'monthly · 31st · 12/yr',
    );
    expect(describeFrequency(noExc({ kind: 'once', date: '2026-12-25' }))).toBe('one-time');
  });
});
