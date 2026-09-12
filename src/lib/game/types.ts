import type { CharacterPreset } from "@/lib/game/characters";
import type { BoardTile } from "@/lib/game/board";
import type { GodKey } from "@/lib/game/gods";
import type { VehicleKey } from "@/lib/game/items";

export interface RoomSettingsInput {
  startingCash: number;
  passStartSalary: number;
  maxPlayers: number;
  jailFine: number;
  parkingJackpotEnabled: boolean;
  stocksEnabled: boolean;
  turnSeconds: number;
}

export interface LobbyPlayerView {
  id: string;
  name: string;
  seatOrder: number;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  isConnected: boolean;
  lastSeenAt: string | null;
  isManaged: boolean;
  managedReason: ManagedReason | null;
  character: CharacterPreset;
}

export interface PropertyView {
  tileIndex: number;
  ownerPlayerId: string | null;
  houseCount: number;
  hasHotel: boolean;
  mortgaged: boolean;
}

export interface StockView {
  symbol: string;
  name: string;
  currentPrice: number;
  previousPrice: number;
  availableShares: number;
  volatility: number;
  change: number;
}

export interface StockHoldingView {
  playerId: string;
  stockSymbol: string;
  shares: number;
  averageCost: number;
  marketValue: number;
  unrealizedProfit: number;
}

export interface InventoryItemView {
  playerId: string;
  itemKey: string;
  quantity: number;
}

export interface LotteryTicketView {
  playerId: string;
  number: number;
  label: string;
  shortLabel: string;
  colorKey: string;
  colorHex: string;
}

export interface LotteryStateView {
  jackpot: number;
  ticketPrice: number;
  drawAtTurn: number;
  turnsUntilDraw: number;
  tickets: LotteryTicketView[];
}

export interface InflationStateView {
  index: number;
  assetBaseTotal: number;
  stepAssetTotal: number;
  nextLevelAssetTotal: number;
}

export interface GodStatusView {
  key: GodKey;
  name: string;
  description: string;
  colorHex: string;
  turnsRemaining: number;
}

export interface MapGodView {
  tileIndex: number;
  key: GodKey;
  name: string;
  description: string;
  colorHex: string;
  turnsRemaining: number;
}

export interface VehicleStatusView {
  key: VehicleKey;
  name: string;
  description: string;
  diceCount: number;
  turnsRemaining: number;
}

export type ManagedReason = "manual" | "timeout";

export interface RecoveryStateView {
  amountDue: number;
  reason: string;
  creditorPlayerId: string | null;
  creditorName: string | null;
}

export interface ItemReactionStateView {
  kind: "payment" | "taxAudit" | "debuff";
  reactingPlayerId: string;
  turnPlayerId: string;
  sourcePlayerId: string | null;
  sourcePlayerName: string | null;
  sourceItemName: string;
  amount: number | null;
  reason: string | null;
  debuffType: "sabotage" | "sleepwalk" | null;
  itemKeys: string[];
}

export interface PlayerGameView {
  id: string;
  name: string;
  seatOrder: number;
  isHost: boolean;
  isReady: boolean;
  isBot: boolean;
  isConnected: boolean;
  lastSeenAt: string | null;
  isManaged: boolean;
  managedReason: ManagedReason | null;
  character: CharacterPreset;
  cash: number;
  position: number;
  lapsCompleted: number;
  inJailTurns: number;
  abductedTurns: number;
  sleepwalkingTurns: number;
  jailFreeCards: number;
  bankSavings: number;
  bankDebt: number;
  activeGod: GodStatusView | null;
  activeVehicle: VehicleStatusView | null;
  isBankrupt: boolean;
  ownedTileIndexes: number[];
  propertyAssetValue: number;
  stockAssetValue: number;
  totalAssets: number;
}

export interface GameSnapshotView {
  id: string;
  phase: string;
  version: number;
  turnNumber: number;
  roundNumber: number;
  currentDate: string;
  currentPlayerId: string;
  winnerPlayerId: string | null;
  inflation: InflationStateView;
  recovery: RecoveryStateView | null;
  reaction: ItemReactionStateView | null;
  lastRoll: { values: number[]; total: number } | null;
  pendingTile: BoardTile | null;
  rollAgainAvailable: boolean;
  board: BoardTile[];
  properties: PropertyView[];
  stocks: StockView[];
  stockHoldings: StockHoldingView[];
  inventoryItems: InventoryItemView[];
  lottery: LotteryStateView;
  mapGods: MapGodView[];
  players: PlayerGameView[];
}

export interface EventView {
  id: string;
  sequence: number;
  eventType: string;
  summary: string;
  createdAt: string;
  actorPlayerId: string | null;
}

export interface RoomSnapshotView {
  id: string;
  code: string;
  status: string;
  settings: RoomSettingsInput & { parkingJackpot: number };
  availableCharacters: CharacterPreset[];
  players: LobbyPlayerView[];
  currentPlayer: LobbyPlayerView | PlayerGameView | null;
  game: GameSnapshotView | null;
  recentEvents: EventView[];
}

export interface RoomListPlayerView {
  name: string;
  characterName: string;
  isHost: boolean;
}

export interface RoomListItemView {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  takenCharacterIds: string[];
  players: RoomListPlayerView[];
  updatedAt: string;
}

export type GameActionType =
  | "rollDice"
  | "buyProperty"
  | "skipPurchase"
  | "declineReaction"
  | "buyItem"
  | "skipShop"
  | "buyLotteryTicket"
  | "skipLottery"
  | "manageBank"
  | "skipBank"
  | "castMagic"
  | "skipMagic"
  | "playAmusement"
  | "endTurn"
  | "payJailFine"
  | "useJailFreeCard"
  | "buildHouse"
  | "mortgage"
  | "unmortgage"
  | "buyStock"
  | "sellStock"
  | "useItem"
  | "declareBankruptcy";

export interface GameActionRequest {
  type: GameActionType;
  clientVersion?: number;
  diceCount?: number;
  controlledRollTotal?: number;
  tileIndex?: number;
  stockSymbol?: string;
  shares?: number;
  itemKey?: string;
  targetPlayerId?: string;
  lotteryNumber?: number;
  bankChoice?: string;
  magicKey?: string;
  amusementChoice?: string;
}
