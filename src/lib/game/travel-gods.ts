import type { GodKey } from "@/lib/game/gods";

export interface TravelGodPropertyState {
  ownerPlayerId: string | null;
  houseCount: number;
  hasHotel: boolean;
  mortgaged: boolean;
}

export function isTravelGodKey(
  key: string | null | undefined,
): key is "tudigong" | "tianshi" | "pohuaishen" {
  return key === "tudigong" || key === "tianshi" || key === "pohuaishen";
}

export function getTraversedTileIndexes(
  startPosition: number,
  steps: number,
  boardSize: number,
) {
  const traversed: number[] = [];
  if (!Number.isInteger(steps) || steps === 0 || boardSize <= 0) {
    return traversed;
  }

  const direction = steps > 0 ? 1 : -1;
  let position = startPosition;

  for (let index = 0; index < Math.abs(steps); index += 1) {
    position += direction;
    if (position >= boardSize) {
      position = 0;
    } else if (position < 0) {
      position = boardSize - 1;
    }
    traversed.push(position);
  }

  return traversed;
}

export function getAffectedTileIndexesForTravelGod(
  godKey: GodKey | null | undefined,
  traversedTileIndexes: number[],
) {
  if (!isTravelGodKey(godKey) || traversedTileIndexes.length === 0) {
    return [];
  }

  return [traversedTileIndexes[traversedTileIndexes.length - 1]!];
}

export function applyTravelGodToProperty(
  godKey: GodKey | null | undefined,
  property: TravelGodPropertyState,
) {
  if (
    !isTravelGodKey(godKey) ||
    godKey === "tudigong" ||
    !property.ownerPlayerId ||
    property.mortgaged
  ) {
    return { changed: false, label: "" };
  }

  if (godKey === "tianshi") {
    if (property.hasHotel) {
      return { changed: false, label: "" };
    }

    if (property.houseCount >= 4) {
      property.houseCount = 0;
      property.hasHotel = true;
      return { changed: true, label: "升级成酒店" };
    }

    property.houseCount += 1;
    return { changed: true, label: `加盖到 ${property.houseCount} 层` };
  }

  if (property.hasHotel) {
    property.hasHotel = false;
    property.houseCount = 4;
    return { changed: true, label: "从酒店拆回 4 层" };
  }

  if (property.houseCount <= 0) {
    return { changed: false, label: "" };
  }

  property.houseCount -= 1;
  return {
    changed: true,
    label: property.houseCount > 0 ? `拆到 ${property.houseCount} 层` : "拆回空地",
  };
}
