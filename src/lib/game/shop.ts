import { ITEM_DEFINITIONS, type ItemDefinition } from "@/lib/game/items";

export const SHOP_OFFER_ITEM_COUNT = 4;

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string) {
  const random = createSeededRandom(seed);
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function getShopOfferItems(input: {
  gameId: string;
  currentPlayerId: string;
  turnNumber: number;
  pendingTileIndex: number | null | undefined;
  version: number;
}) {
  if (input.pendingTileIndex === null || input.pendingTileIndex === undefined) {
    return [] as ItemDefinition[];
  }

  const seed = [
    input.gameId,
    input.currentPlayerId,
    input.turnNumber,
    input.pendingTileIndex,
    input.version,
  ].join(":");

  return shuffleWithSeed(ITEM_DEFINITIONS, seed).slice(
    0,
    Math.min(SHOP_OFFER_ITEM_COUNT, ITEM_DEFINITIONS.length),
  );
}

export function isItemInShopOffer(
  itemKey: string,
  input: Parameters<typeof getShopOfferItems>[0],
) {
  return getShopOfferItems(input).some((item) => item.key === itemKey);
}
