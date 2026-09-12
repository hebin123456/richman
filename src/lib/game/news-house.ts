export interface NewsHousePlayerSummary {
  id: string;
  propertyAssetValue: number;
  isBankrupt: boolean;
}

export interface NewsHousePropertyState {
  tileIndex: number;
  ownerPlayerId: string | null;
  houseCount: number;
  hasHotel: boolean;
}

export function getPropertyStructureLevels(property: Pick<NewsHousePropertyState, "houseCount" | "hasHotel">) {
  if (property.hasHotel) {
    return 5;
  }

  return Math.max(0, property.houseCount);
}

export function getPlayerRepairStructureLevels(
  properties: NewsHousePropertyState[],
  playerId: string,
) {
  return properties
    .filter((property) => property.ownerPlayerId === playerId)
    .reduce((sum, property) => sum + getPropertyStructureLevels(property), 0);
}

export function getTopLandlordPlayerIds(players: NewsHousePlayerSummary[]) {
  const activePlayers = players.filter((player) => !player.isBankrupt);
  const highestPropertyAssetValue = activePlayers.reduce(
    (highest, player) => Math.max(highest, player.propertyAssetValue),
    0,
  );

  if (highestPropertyAssetValue <= 0) {
    return [];
  }

  return activePlayers
    .filter((player) => player.propertyAssetValue === highestPropertyAssetValue)
    .map((player) => player.id);
}

export function getCollapsiblePropertyTileIndexes(properties: NewsHousePropertyState[]) {
  return properties
    .filter(
      (property) =>
        property.ownerPlayerId &&
        getPropertyStructureLevels(property) > 0,
    )
    .map((property) => property.tileIndex);
}

export function collapsePropertyToEmptyLot(
  property: Pick<NewsHousePropertyState, "houseCount" | "hasHotel">,
) {
  property.houseCount = 0;
  property.hasHotel = false;
}
