import { describe, expect, it } from "vitest";

import {
  buildControlledDiceValues,
  getRollTotalUpperBound,
  rollDiceValues,
} from "./dice";

describe("dice helpers", () => {
  it("rolls the requested number of standard dice", () => {
    expect(rollDiceValues(3, () => 0)).toEqual([1, 1, 1]);
  });

  it("builds a legal controlled result for a single die", () => {
    expect(buildControlledDiceValues(1, 6)).toEqual([6]);
  });

  it("builds a balanced controlled result for multiple dice", () => {
    expect(buildControlledDiceValues(2, 7)).toEqual([4, 3]);
    expect(buildControlledDiceValues(3, 17)).toEqual([6, 6, 5]);
  });

  it("allows low totals even when multiple dice are available", () => {
    expect(buildControlledDiceValues(3, 1)).toEqual([1]);
  });

  it("rejects totals above the current dice range", () => {
    expect(getRollTotalUpperBound(2)).toBe(12);
    expect(() => buildControlledDiceValues(2, 13)).toThrow(
      "遥控骰子的点数必须在 1 到 12 之间。",
    );
  });
});
