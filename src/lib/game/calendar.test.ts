import { describe, expect, it } from "vitest";

import {
  calculateMonthlySavingsInterest,
  formatDateKeyFromDate,
  getRoundDateKey,
  getRoundNumberForTurn,
  getTurnDateKey,
  isFirstDayOfMonth,
  isWeekendDateKey,
  resolveCalendarStartDate,
} from "./calendar";

describe("game calendar helpers", () => {
  it("advances turns by real calendar days", () => {
    expect(getTurnDateKey("2026-01-30", 1)).toBe("2026-01-30");
    expect(getTurnDateKey("2026-01-30", 2)).toBe("2026-01-31");
    expect(getTurnDateKey("2026-01-30", 3)).toBe("2026-02-01");
    expect(isFirstDayOfMonth(getTurnDateKey("2026-01-30", 3))).toBe(true);
  });

  it("advances game date by full rounds", () => {
    expect(getRoundDateKey("2026-01-30", 1)).toBe("2026-01-30");
    expect(getRoundDateKey("2026-01-30", 2)).toBe("2026-01-31");
    expect(isFirstDayOfMonth(getRoundDateKey("2026-01-30", 3))).toBe(true);
  });

  it("calculates monthly savings interest at ten percent", () => {
    expect(calculateMonthlySavingsInterest(0)).toBe(0);
    expect(calculateMonthlySavingsInterest(300)).toBe(30);
    expect(calculateMonthlySavingsInterest(365)).toBe(36);
  });

  it("falls back to createdAt date when start date is missing", () => {
    const createdAt = new Date(2026, 4, 5, 9, 30, 0);
    expect(resolveCalendarStartDate(null, createdAt)).toBe(formatDateKeyFromDate(createdAt));
    expect(resolveCalendarStartDate("2026-05-08", createdAt)).toBe("2026-05-08");
  });

  it("treats saturday and sunday as weekend", () => {
    expect(isWeekendDateKey("2026-05-09")).toBe(true);
    expect(isWeekendDateKey("2026-05-10")).toBe(true);
  });

  it("treats weekdays as trading days", () => {
    expect(isWeekendDateKey("2026-05-06")).toBe(false);
  });

  it("counts one round only after all active players act once", () => {
    const participants = [
      { id: "p1", seatOrder: 0, bankruptAtTurn: null },
      { id: "p2", seatOrder: 1, bankruptAtTurn: null },
      { id: "p3", seatOrder: 2, bankruptAtTurn: null },
    ];

    expect(getRoundNumberForTurn(1, participants)).toBe(1);
    expect(getRoundNumberForTurn(2, participants)).toBe(1);
    expect(getRoundNumberForTurn(3, participants)).toBe(1);
    expect(getRoundNumberForTurn(4, participants)).toBe(2);
  });

  it("shortens later rounds after a player goes bankrupt", () => {
    const participants = [
      { id: "p1", seatOrder: 0, bankruptAtTurn: null },
      { id: "p2", seatOrder: 1, bankruptAtTurn: 2 },
      { id: "p3", seatOrder: 2, bankruptAtTurn: null },
    ];

    expect(getRoundNumberForTurn(3, participants)).toBe(1);
    expect(getRoundNumberForTurn(4, participants)).toBe(2);
  });
});
