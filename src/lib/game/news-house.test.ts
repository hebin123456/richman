import { describe, expect, it } from "vitest";

import {
  collapsePropertyToEmptyLot,
  getCollapsiblePropertyTileIndexes,
  getPlayerRepairStructureLevels,
  getPropertyStructureLevels,
  getTopLandlordPlayerIds,
} from "./news-house";

describe("news house helpers", () => {
  it("counts hotel as five repair levels", () => {
    expect(getPropertyStructureLevels({ houseCount: 0, hasHotel: true })).toBe(5);
    expect(getPropertyStructureLevels({ houseCount: 3, hasHotel: false })).toBe(3);
  });

  it("sums repair levels across a player's properties", () => {
    expect(
      getPlayerRepairStructureLevels(
        [
          { tileIndex: 1, ownerPlayerId: "player-1", houseCount: 2, hasHotel: false },
          { tileIndex: 2, ownerPlayerId: "player-1", houseCount: 0, hasHotel: true },
          { tileIndex: 3, ownerPlayerId: "player-2", houseCount: 4, hasHotel: false },
        ],
        "player-1",
      ),
    ).toBe(7);
  });

  it("returns all tied top landlords by property asset value", () => {
    expect(
      getTopLandlordPlayerIds([
        { id: "player-1", propertyAssetValue: 1200, isBankrupt: false },
        { id: "player-2", propertyAssetValue: 1600, isBankrupt: false },
        { id: "player-3", propertyAssetValue: 1600, isBankrupt: false },
      ]),
    ).toEqual(["player-2", "player-3"]);
  });

  it("only marks built properties as collapsible", () => {
    expect(
      getCollapsiblePropertyTileIndexes([
        { tileIndex: 1, ownerPlayerId: "player-1", houseCount: 0, hasHotel: false },
        { tileIndex: 2, ownerPlayerId: "player-1", houseCount: 1, hasHotel: false },
        { tileIndex: 3, ownerPlayerId: "player-2", houseCount: 0, hasHotel: true },
        { tileIndex: 4, ownerPlayerId: null, houseCount: 3, hasHotel: false },
      ]),
    ).toEqual([2, 3]);
  });

  it("collapses a property back to empty land", () => {
    const property = { houseCount: 0, hasHotel: true };
    collapsePropertyToEmptyLot(property);
    expect(property).toEqual({ houseCount: 0, hasHotel: false });
  });
});
