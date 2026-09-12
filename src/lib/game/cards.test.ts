import { describe, expect, it } from "vitest";

import {
  CHANCE_CARDS,
  COMMUNITY_CARDS,
  createShuffledDeck,
  getCardById,
  type CardDefinition,
  type CardDeckType,
} from "@/lib/game/cards";

function validateDeck(deck: CardDeckType, source: CardDefinition[]) {
  const shuffled = createShuffledDeck(deck);
  const expectedIds = source.map((card) => card.id);

  expect(shuffled).toHaveLength(expectedIds.length);
  expect(new Set(shuffled).size).toBe(expectedIds.length);
  expect(new Set(shuffled)).toEqual(new Set(expectedIds));

  shuffled.forEach((cardId) => {
    const card = getCardById(cardId);
    expect(card).toBeDefined();
    expect(card?.deck).toBe(deck);
    expect(card?.title.length).toBeGreaterThan(0);
    expect(card?.description.length).toBeGreaterThan(0);
  });
}

describe("cards", () => {
  it("creates a chance deck containing each chance card once", () => {
    validateDeck("chance", CHANCE_CARDS);
  });

  it("creates a community deck containing each community card once", () => {
    validateDeck("community", COMMUNITY_CARDS);
  });

  it("keeps all card ids globally unique", () => {
    const allIds = [...CHANCE_CARDS, ...COMMUNITY_CARDS].map((card) => card.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("keeps both decks varied enough to cover core effect categories", () => {
    const effectTypes = (cards: CardDefinition[]) => new Set(cards.map((card) => card.effect.type));

    expect(effectTypes(CHANCE_CARDS)).toEqual(
      new Set(["collect", "pay", "collectFromPlayers", "moveAbsolute", "moveRelative", "goToJail", "jailFree", "randomItem"]),
    );
    expect(effectTypes(COMMUNITY_CARDS)).toEqual(
      new Set(["collect", "pay", "collectFromPlayers", "moveAbsolute", "moveRelative", "goToJail", "jailFree", "randomItem"]),
    );
  });
});
