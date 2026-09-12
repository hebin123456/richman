import { describe, expect, it } from "vitest";

import {
  applyTravelGodToProperty,
  getAffectedTileIndexesForTravelGod,
  getTraversedTileIndexes,
  isTravelGodKey,
} from "./travel-gods";

describe("travel gods", () => {
  it("tracks every traversed tile including the destination", () => {
    expect(getTraversedTileIndexes(38, 3, 40)).toEqual([39, 0, 1]);
    expect(getTraversedTileIndexes(2, -2, 40)).toEqual([1, 0]);
  });

  it("treats land god as a travel god", () => {
    expect(isTravelGodKey("tudigong")).toBe(true);
  });

  it("lets all travel gods only affect the destination tile", () => {
    const traversed = [5, 6, 7];

    expect(getAffectedTileIndexesForTravelGod("tudigong", traversed)).toEqual([7]);
    expect(getAffectedTileIndexesForTravelGod("tianshi", traversed)).toEqual([7]);
    expect(getAffectedTileIndexesForTravelGod("pohuaishen", traversed)).toEqual([7]);
  });

  it("lets angel upgrade an owned property by one level", () => {
    const property = {
      ownerPlayerId: "player-1",
      houseCount: 4,
      hasHotel: false,
      mortgaged: false,
    };

    expect(applyTravelGodToProperty("tianshi", property)).toEqual({
      changed: true,
      label: "升级成酒店",
    });
    expect(property).toEqual({
      ownerPlayerId: "player-1",
      houseCount: 0,
      hasHotel: true,
      mortgaged: false,
    });
  });

  it("lets destroy god remove one level from an owned property", () => {
    const property = {
      ownerPlayerId: "player-1",
      houseCount: 1,
      hasHotel: false,
      mortgaged: false,
    };

    expect(applyTravelGodToProperty("pohuaishen", property)).toEqual({
      changed: true,
      label: "拆回空地",
    });
    expect(property.houseCount).toBe(0);
  });

  it("does not modify unowned properties", () => {
    const property = {
      ownerPlayerId: null,
      houseCount: 2,
      hasHotel: false,
      mortgaged: false,
    };

    expect(applyTravelGodToProperty("tianshi", property)).toEqual({
      changed: false,
      label: "",
    });
    expect(property.houseCount).toBe(2);
  });
});
