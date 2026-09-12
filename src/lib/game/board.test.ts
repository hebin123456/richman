import { describe, expect, it } from "vitest";

import { BOARD_TILES, JAIL_INDEX } from "@/lib/game/board";

describe("board corner layout", () => {
  it("places free parking at the top-left corner", () => {
    expect(BOARD_TILES[17]?.type).toBe("freeParking");
  });

  it("places jail at the top-right corner", () => {
    expect(BOARD_TILES[26]?.type).toBe("jail");
    expect(JAIL_INDEX).toBe(26);
  });

  it("places chance near the opening stretch", () => {
    expect(BOARD_TILES[3]?.type).toBe("chance");
  });

  it("places community after the first city block", () => {
    expect(BOARD_TILES[9]?.type).toBe("community");
  });
});
