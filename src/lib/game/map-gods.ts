import { BOARD_TILES } from "./board";
import { GOD_DEFINITIONS, getGodDefinition, normalizeGodKey, type GodKey } from "./gods";
import type { MapGodView } from "./types";

export interface MapGodSpawn {
  tileIndex: number;
  godKey: GodKey;
  turnsRemaining: number;
}

export const MAP_GOD_MAX_COUNT = 2;
export const MAP_GOD_DURATION_TURNS = 4;
export const MAP_GOD_SPAWN_CHANCE = 0.55;

const ELIGIBLE_TILE_TYPES = new Set([
  "property",
  "railroad",
  "bank",
  "magic",
  "chance",
  "community",
  "news",
  "freeCard",
  "amusement",
  "shop",
  "lottery",
  "tax",
]);

const ELIGIBLE_TILE_INDEXES = BOARD_TILES.filter((tile) => ELIGIBLE_TILE_TYPES.has(tile.type)).map(
  (tile) => tile.index,
);

function isGodKey(value: string): value is GodKey {
  return Boolean(normalizeGodKey(value));
}

export function parseMapGodSpawns(serialized: string | null | undefined): MapGodSpawn[] {
  if (!serialized) {
    return [];
  }

  try {
    const value = JSON.parse(serialized);
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is MapGodSpawn => {
      if (!entry || typeof entry !== "object") {
        return false;
      }

      const tileIndex = Reflect.get(entry, "tileIndex");
      const godKey = Reflect.get(entry, "godKey");
      const turnsRemaining = Reflect.get(entry, "turnsRemaining");
      return (
        typeof tileIndex === "number" &&
        Number.isInteger(tileIndex) &&
        ELIGIBLE_TILE_INDEXES.includes(tileIndex) &&
        typeof godKey === "string" &&
        isGodKey(godKey) &&
        typeof turnsRemaining === "number" &&
        Number.isInteger(turnsRemaining) &&
        turnsRemaining > 0
      );
    }).map((entry) => ({
      ...entry,
      godKey: normalizeGodKey(entry.godKey)!,
    }));
  } catch {
    return [];
  }
}

export function serializeMapGodSpawns(spawns: MapGodSpawn[]) {
  return JSON.stringify(spawns);
}

export function stepMapGodSpawns(spawns: MapGodSpawn[]) {
  return spawns
    .map((spawn) => ({
      ...spawn,
      turnsRemaining: spawn.turnsRemaining - 1,
    }))
    .filter((spawn) => spawn.turnsRemaining > 0);
}

export function createRandomMapGodSpawn(
  occupiedTileIndexes: number[],
  random: () => number = Math.random,
): MapGodSpawn | null {
  const candidates = ELIGIBLE_TILE_INDEXES.filter((tileIndex) => !occupiedTileIndexes.includes(tileIndex));
  if (candidates.length === 0) {
    return null;
  }

  const tileIndex = candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
  const godDefinition =
    GOD_DEFINITIONS[Math.floor(random() * GOD_DEFINITIONS.length)] ?? GOD_DEFINITIONS[0];

  return {
    tileIndex,
    godKey: godDefinition.key,
    turnsRemaining: MAP_GOD_DURATION_TURNS,
  };
}

export function getMapGodSpawnAtTile(spawns: MapGodSpawn[], tileIndex: number) {
  return spawns.find((spawn) => spawn.tileIndex === tileIndex) ?? null;
}

function getCircularTileDistance(fromTileIndex: number, toTileIndex: number, boardSize: number) {
  const delta = Math.abs(toTileIndex - fromTileIndex);
  return Math.min(delta, boardSize - delta);
}

export function getNearestMapGodSpawn(
  spawns: MapGodSpawn[],
  playerTileIndex: number,
  boardSize = BOARD_TILES.length,
) {
  if (spawns.length === 0) {
    return null;
  }

  return [...spawns].sort((left, right) => {
    const leftDistance = getCircularTileDistance(playerTileIndex, left.tileIndex, boardSize);
    const rightDistance = getCircularTileDistance(playerTileIndex, right.tileIndex, boardSize);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    const leftForward = (left.tileIndex - playerTileIndex + boardSize) % boardSize;
    const rightForward = (right.tileIndex - playerTileIndex + boardSize) % boardSize;
    if (leftForward !== rightForward) {
      return leftForward - rightForward;
    }

    return left.tileIndex - right.tileIndex;
  })[0]!;
}

export function toMapGodView(spawn: MapGodSpawn): MapGodView | null {
  const definition = getGodDefinition(spawn.godKey);
  if (!definition) {
    return null;
  }

  return {
    tileIndex: spawn.tileIndex,
    key: definition.key,
    name: definition.name,
    description: definition.description,
    colorHex: definition.colorHex,
    turnsRemaining: spawn.turnsRemaining,
  };
}
