import { describe, expect, it } from "vitest";

import { getShopOfferItems, isItemInShopOffer } from "./shop";

const baseInput = {
  gameId: "game-1",
  currentPlayerId: "player-1",
  turnNumber: 3,
  pendingTileIndex: 12,
  version: 7,
};

describe("shop offers", () => {
  it("returns a stable random offer for the same shop state", () => {
    const first = getShopOfferItems(baseInput).map((item) => item.key);
    const second = getShopOfferItems(baseInput).map((item) => item.key);

    expect(first).toEqual(second);
  });

  it("refreshes the offer when the shop state changes", () => {
    const first = getShopOfferItems(baseInput).map((item) => item.key);
    const refreshed = getShopOfferItems({
      ...baseInput,
      version: baseInput.version + 1,
    }).map((item) => item.key);

    expect(refreshed).not.toEqual(first);
  });

  it("can validate whether an item belongs to the current offer", () => {
    const offer = getShopOfferItems(baseInput);
    expect(isItemInShopOffer(offer[0]?.key ?? "", baseInput)).toBe(true);
    expect(isItemInShopOffer("missing-item", baseInput)).toBe(false);
  });
});
