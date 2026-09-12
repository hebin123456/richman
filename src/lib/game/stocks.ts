export interface StockDefinition {
  symbol: string;
  name: string;
  startingPrice: number;
  availableShares: number;
  volatility: number;
}

export const STOCK_DEFINITIONS: StockDefinition[] = [
  {
    symbol: "TEC",
    name: "科技巨头",
    startingPrice: 90,
    availableShares: 160,
    volatility: 14,
  },
  {
    symbol: "RET",
    name: "零售港湾",
    startingPrice: 70,
    availableShares: 180,
    volatility: 10,
  },
  {
    symbol: "BIO",
    name: "生技实验室",
    startingPrice: 120,
    availableShares: 120,
    volatility: 18,
  },
  {
    symbol: "COS",
    name: "星河传媒",
    startingPrice: 150,
    availableShares: 100,
    volatility: 22,
  },
];

export const STOCK_DEFINITION_MAP = Object.fromEntries(
  STOCK_DEFINITIONS.map((stock) => [stock.symbol, stock]),
) as Record<string, StockDefinition>;

export function getStockDefinition(symbol: string) {
  return STOCK_DEFINITION_MAP[symbol] ?? null;
}
