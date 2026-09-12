import { describe, expect, it } from "vitest";

import { BOARD_TILES } from "@/lib/game/board";

import {
  calculateInflationState,
  getEffectiveBankAmount,
  getEffectiveHouseCost,
  getEffectiveMortgageValue,
  getEffectivePropertyRent,
  getEffectiveRailroadRent,
  getEffectiveTaxAmount,
  getEffectiveTilePrice,
  getEffectiveUnmortgageCost,
  resolveBankAutoRepayment,
} from "./economy";

const propertyTile = BOARD_TILES.find((tile) => tile.type === "property");
const railroadTile = BOARD_TILES.find((tile) => tile.type === "railroad");
const taxTile = BOARD_TILES.find((tile) => tile.type === "tax");

if (!propertyTile || propertyTile.type !== "property") {
  throw new Error("Missing property tile fixture.");
}

if (!taxTile || taxTile.type !== "tax") {
  throw new Error("Missing tax tile fixture.");
}

if (!railroadTile || railroadTile.type !== "railroad") {
  throw new Error("Missing railroad tile fixture.");
}

describe("economy inflation", () => {
  it("keeps price index at 1 before crossing the next threshold", () => {
    const state = calculateInflationState(6000, 2000, 2);
    expect(state.index).toBe(1);
    expect(state.nextLevelAssetTotal).toBe(6001);
  });

  it("raises price index when total assets cross a threshold", () => {
    const state = calculateInflationState(6001, 2000, 2);
    expect(state.index).toBe(2);
    expect(state.nextLevelAssetTotal).toBe(12001);
  });

  it("keeps asset prices fixed when inflation rises", () => {
    expect(getEffectiveTilePrice(propertyTile, 3)).toBe(propertyTile.price);
    expect(getEffectiveHouseCost(propertyTile, 3)).toBe(propertyTile.houseCost);
    expect(getEffectiveBankAmount(500, 4)).toBe(500);
  });

  it("still scales fines and tolls with inflation", () => {
    expect(getEffectiveTaxAmount(taxTile, 3)).toBe(taxTile.amount * 3);
    expect(getEffectivePropertyRent(propertyTile, 0, false, undefined, 3)).toBe(
      propertyTile.baseRent * 3,
    );
  });

  it("doubles railroad toll when both railroads are owned", () => {
    expect(getEffectiveRailroadRent(1, 1)).toBe(35);
    expect(getEffectiveRailroadRent(2, 1)).toBe(70);
    expect(getEffectivePropertyRent(railroadTile, 0, false, 2, 1)).toBe(70);
  });

  it("mortgages by full land price and redeems with a ten percent fee", () => {
    expect(getEffectiveMortgageValue(propertyTile, 2)).toBe(propertyTile.price);
    expect(getEffectiveUnmortgageCost(propertyTile, 2)).toBe(
      propertyTile.price + Math.ceil(propertyTile.price * 0.1),
    );
  });

  it("auto repayment uses savings before cash", () => {
    expect(resolveBankAutoRepayment(200, 400, 550)).toEqual({
      fromSavings: 400,
      fromCash: 150,
      totalPaid: 550,
      remainingDebt: 0,
      nextCash: 50,
      nextSavings: 0,
    });
  });

  it("reports the remaining debt when liquid assets are insufficient", () => {
    expect(resolveBankAutoRepayment(80, 120, 300)).toEqual({
      fromSavings: 120,
      fromCash: 80,
      totalPaid: 200,
      remainingDebt: 100,
      nextCash: 0,
      nextSavings: 0,
    });
  });
});
