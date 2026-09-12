import { getMonopolyGroupSize, getTile, type BoardTile } from "@/lib/game/board";
import type { ItemDefinition } from "@/lib/game/items";
import { LOTTERY_BASE_JACKPOT, LOTTERY_TICKET_PRICE } from "@/lib/game/lottery";

export const MIN_INFLATION_STEP_ASSETS = 6000;
export const INFLATION_STEP_RATIO = 1.5;

function normalizeInflationIndex(inflationIndex: number) {
  return Math.max(1, Math.floor(inflationIndex));
}

function normalizeBaseMoney(baseAmount: number) {
  return Math.max(0, Math.floor(baseAmount));
}

export function scaleMoney(baseAmount: number, inflationIndex: number) {
  return Math.max(0, Math.round(baseAmount * normalizeInflationIndex(inflationIndex)));
}

export function calculateInflationStepAssets(startingCash: number, playerCount: number) {
  return Math.max(
    MIN_INFLATION_STEP_ASSETS,
    Math.floor(Math.max(1, startingCash) * Math.max(2, playerCount) * INFLATION_STEP_RATIO),
  );
}

export function calculateInflationIndex(
  assetBaseTotal: number,
  startingCash: number,
  playerCount: number,
) {
  const stepAssetTotal = calculateInflationStepAssets(startingCash, playerCount);
  const normalizedAssetTotal = Math.max(1, Math.floor(assetBaseTotal));
  return Math.max(1, Math.floor((normalizedAssetTotal - 1) / stepAssetTotal) + 1);
}

export function calculateInflationState(
  assetBaseTotal: number,
  startingCash: number,
  playerCount: number,
) {
  const stepAssetTotal = calculateInflationStepAssets(startingCash, playerCount);
  const index = calculateInflationIndex(assetBaseTotal, startingCash, playerCount);

  return {
    index,
    assetBaseTotal: Math.max(0, Math.floor(assetBaseTotal)),
    stepAssetTotal,
    nextLevelAssetTotal: stepAssetTotal * index + 1,
  };
}

export function calculatePropertyAssetValue(
  tileIndex: number,
  houseCount: number,
  hasHotel: boolean,
  _inflationIndex = 1,
) {
  const tile = getTile(tileIndex);

  if ("price" in tile) {
    if (tile.type === "property") {
      const structureValue = hasHotel ? tile.houseCost * 5 : tile.houseCost * houseCount;
      return normalizeBaseMoney(tile.price + structureValue);
    }

    return normalizeBaseMoney(tile.price);
  }

  return 0;
}

export function calculatePlayerTotalAssets(
  cash: number,
  bankSavings: number,
  propertyAssetValue: number,
  stockAssetValue: number,
  bankDebt: number,
) {
  return cash + bankSavings + propertyAssetValue + stockAssetValue - bankDebt;
}

export interface BankAutoRepaymentResult {
  fromSavings: number;
  fromCash: number;
  totalPaid: number;
  remainingDebt: number;
  nextCash: number;
  nextSavings: number;
}

export function resolveBankAutoRepayment(
  cash: number,
  bankSavings: number,
  bankDebt: number,
): BankAutoRepaymentResult {
  const normalizedCash = Math.max(0, Math.floor(cash));
  const normalizedSavings = Math.max(0, Math.floor(bankSavings));
  let remainingDebt = Math.max(0, Math.floor(bankDebt));

  const fromSavings = Math.min(normalizedSavings, remainingDebt);
  remainingDebt -= fromSavings;

  const fromCash = Math.min(normalizedCash, remainingDebt);
  remainingDebt -= fromCash;

  return {
    fromSavings,
    fromCash,
    totalPaid: Math.max(0, Math.floor(bankDebt)) - remainingDebt,
    remainingDebt,
    nextCash: normalizedCash - fromCash,
    nextSavings: normalizedSavings - fromSavings,
  };
}

export function getEffectivePassStartSalary(baseSalary: number, _inflationIndex: number) {
  return normalizeBaseMoney(baseSalary);
}

export function getEffectiveJailFine(baseFine: number, inflationIndex: number) {
  return scaleMoney(baseFine, inflationIndex);
}

export function getEffectiveBankAmount(baseAmount: number, _inflationIndex: number) {
  return normalizeBaseMoney(baseAmount);
}

export function getEffectiveMortgageValue(tile: BoardTile, inflationIndex: number) {
  return getEffectiveTilePrice(tile, inflationIndex);
}

export function getEffectiveUnmortgageServiceFee(
  tile: BoardTile,
  inflationIndex: number,
) {
  return Math.ceil(getEffectiveMortgageValue(tile, inflationIndex) * 0.1);
}

export function getEffectiveUnmortgageCost(tile: BoardTile, inflationIndex: number) {
  return (
    getEffectiveMortgageValue(tile, inflationIndex) +
    getEffectiveUnmortgageServiceFee(tile, inflationIndex)
  );
}

export function getEffectiveItemPrice(item: ItemDefinition, _inflationIndex: number) {
  return normalizeBaseMoney(item.price);
}

export function getEffectiveItemAmount(baseAmount: number, _inflationIndex: number) {
  return normalizeBaseMoney(baseAmount);
}

export function getEffectiveLotteryTicketPrice(_inflationIndex: number) {
  return normalizeBaseMoney(LOTTERY_TICKET_PRICE);
}

export function getEffectiveLotteryBaseJackpot(_inflationIndex: number) {
  return normalizeBaseMoney(LOTTERY_BASE_JACKPOT);
}

export function getEffectiveTilePrice(tile: BoardTile, _inflationIndex: number) {
  return "price" in tile ? normalizeBaseMoney(tile.price) : 0;
}

export function getEffectiveHouseCost(tile: BoardTile, _inflationIndex: number) {
  return tile.type === "property" ? normalizeBaseMoney(tile.houseCost) : 0;
}

export function getEffectiveTaxAmount(tile: BoardTile, inflationIndex: number) {
  return tile.type === "tax" ? scaleMoney(tile.amount, inflationIndex) : 0;
}

export function getEffectiveRailroadRent(railroadsOwned: number, inflationIndex: number) {
  const normalizedOwned = Math.max(0, Math.floor(railroadsOwned));
  if (normalizedOwned <= 0) {
    return 0;
  }

  // Current board has two railroads: owning both doubles the toll.
  const baseRent = normalizedOwned >= 2 ? 70 : 35;
  return scaleMoney(baseRent, inflationIndex);
}

export function getEffectivePropertyRent(
  tile: BoardTile,
  houseCount: number,
  hasHotel: boolean,
  ownerOwnedGroupCount?: number,
  inflationIndex = 1,
) {
  if (tile.type === "railroad") {
    return getEffectiveRailroadRent(ownerOwnedGroupCount ?? 1, inflationIndex);
  }

  if (tile.type !== "property") {
    return 0;
  }

  let baseRent = tile.baseRent;
  if (hasHotel) {
    baseRent = tile.hotelRent;
  } else if (houseCount > 0) {
    baseRent = tile.houseRents[houseCount - 1] ?? tile.houseRents[0];
  } else if (
    typeof ownerOwnedGroupCount === "number" &&
    ownerOwnedGroupCount === getMonopolyGroupSize(tile.group)
  ) {
    baseRent = tile.baseRent * 2;
  }

  return scaleMoney(baseRent, inflationIndex);
}
