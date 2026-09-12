import type { BoardTile } from "@/lib/game/board";

export interface TileCoordinate {
  x: number;
  y: number;
  side: "bottom" | "left" | "top" | "right";
}

export interface BoardWorldLayout {
  originX: number;
  originY: number;
  boardWidth: number;
  boardHeight: number;
  cellWidth: number;
  cellHeight: number;
}

const BOARD_COLUMNS = 10;

const BOARD_ROWS = 9;

export const GROUP_COLORS: Record<string, number> = {
  brown: 0x92400e,
  lightBlue: 0x38bdf8,
  pink: 0xec4899,
  orange: 0xf97316,
  red: 0xef4444,
  yellow: 0xeab308,
  darkBlue: 0x1d4ed8,
};

const TILE_COORDINATES = buildTileCoordinates();

function buildTileCoordinates(): TileCoordinate[] {
  const coordinates: TileCoordinate[] = [];

  for (let index = 0; index < BOARD_COLUMNS - 1; index += 1) {
    coordinates.push({ x: BOARD_COLUMNS - 1 - index, y: BOARD_ROWS - 1, side: "bottom" });
  }

  for (let index = 0; index < BOARD_ROWS - 1; index += 1) {
    coordinates.push({ x: 0, y: BOARD_ROWS - 1 - index, side: "left" });
  }

  for (let index = 0; index < BOARD_COLUMNS - 1; index += 1) {
    coordinates.push({ x: index, y: 0, side: "top" });
  }

  for (let index = 0; index < BOARD_ROWS - 1; index += 1) {
    coordinates.push({ x: BOARD_COLUMNS - 1, y: index, side: "right" });
  }

  return coordinates;
}

export function getTileCoordinate(tileIndex: number) {
  return TILE_COORDINATES[tileIndex] ?? TILE_COORDINATES[0];
}

export function getBoardLayout(viewWidth: number, viewHeight: number): BoardWorldLayout {
  const compact = viewWidth < 1100;
  const expansive = !compact && viewWidth >= 1600;
  const sidebarWidth = compact
    ? 0
    : Math.min(expansive ? 312 : 328, Math.max(272, viewWidth * (expansive ? 0.17 : 0.195)));
  const horizontalPadding = compact
    ? Math.max(12, viewWidth * 0.015)
    : Math.max(16, viewWidth * (expansive ? 0.012 : 0.014));
  const topInset = compact
    ? Math.max(108, viewHeight * 0.13)
    : Math.max(expansive ? 88 : 96, viewHeight * (expansive ? 0.082 : 0.094));
  const bottomInset = compact
    ? Math.max(196, viewHeight * 0.25)
    : Math.max(10, viewHeight * 0.018);
  const availableWidth = Math.max(
    320,
    viewWidth - sidebarWidth - horizontalPadding * 2 - (compact ? 0 : 8),
  );
  const availableHeight = Math.max(320, viewHeight - topInset - bottomInset);

  const boardWidth = Math.min(availableWidth, availableHeight * (BOARD_COLUMNS / BOARD_ROWS));
  const boardHeight = boardWidth * (BOARD_ROWS / BOARD_COLUMNS);
  const originX = horizontalPadding + (availableWidth - boardWidth) * 0.5;
  const originY = topInset + (availableHeight - boardHeight) * 0.5;

  return {
    originX,
    originY,
    boardWidth,
    boardHeight,
    cellWidth: boardWidth / BOARD_COLUMNS,
    cellHeight: boardHeight / BOARD_ROWS,
  };
}

export function getTileAccentColor(tile: BoardTile) {
  if (tile.type === "property") {
    return GROUP_COLORS[tile.group] ?? 0x94a3b8;
  }

  switch (tile.type) {
    case "start":
      return 0xfacc15;
    case "railroad":
      return 0x475569;
    case "bank":
      return 0x0ea5e9;
    case "magic":
      return 0x8b5cf6;
    case "chance":
      return 0x3b82f6;
    case "community":
      return 0x14b8a6;
    case "news":
      return 0xf97316;
    case "freeCard":
      return 0x22c55e;
    case "amusement":
      return 0xf43f5e;
    case "shop":
      return 0xd946ef;
    case "lottery":
      return 0xeab308;
    case "tax":
      return 0xf43f5e;
    case "jail":
      return 0xf97316;
    case "freeParking":
      return 0x22c55e;
    case "goToJail":
      return 0xdc2626;
    default:
      return 0xcbd5e1;
  }
}
