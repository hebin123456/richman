import { describe, expect, it } from "vitest";

import { resolveLotteryDraw } from "./lottery";

describe("resolveLotteryDraw", () => {
  it("aggregates payouts by matching ticket count", () => {
    const result = resolveLotteryDraw(
      [
        { playerId: "p1", number: 1, purchasedAtTurn: 1 },
        { playerId: "p1", number: 1, purchasedAtTurn: 2 },
        { playerId: "p2", number: 1, purchasedAtTurn: 2 },
        { playerId: "p3", number: 3, purchasedAtTurn: 2 },
      ],
      900,
      1,
    );

    expect(result.payoutPerTicket).toBe(300);
    expect(result.remainder).toBe(0);
    expect(result.payouts).toEqual([
      { playerId: "p1", ticketCount: 2, amount: 600 },
      { playerId: "p2", ticketCount: 1, amount: 300 },
    ]);
  });

  it("keeps the jackpot untouched when nobody wins", () => {
    const result = resolveLotteryDraw(
      [{ playerId: "p1", number: 2, purchasedAtTurn: 1 }],
      700,
      5,
    );

    expect(result.matchingTickets).toEqual([]);
    expect(result.payoutPerTicket).toBe(0);
    expect(result.payouts).toEqual([]);
    expect(result.remainder).toBe(700);
  });
});
