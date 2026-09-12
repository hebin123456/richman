export function rollDiceValues(
  diceCount: number,
  random: () => number = Math.random,
) {
  return Array.from({ length: Math.max(1, Math.floor(diceCount)) }, () =>
    Math.floor(random() * 6) + 1,
  );
}

export function getRollTotalUpperBound(maxDiceCount: number) {
  return Math.max(1, Math.floor(maxDiceCount)) * 6;
}

export function buildControlledDiceValues(
  maxDiceCount: number,
  desiredTotal: number,
) {
  const normalizedMaxDiceCount = Math.max(1, Math.floor(maxDiceCount));
  const maxTotal = getRollTotalUpperBound(normalizedMaxDiceCount);

  if (
    !Number.isInteger(desiredTotal) ||
    desiredTotal < 1 ||
    desiredTotal > maxTotal
  ) {
    throw new Error(`遥控骰子的点数必须在 1 到 ${maxTotal} 之间。`);
  }

  const diceCount = Math.max(1, Math.ceil(desiredTotal / 6));
  const baseValue = Math.floor(desiredTotal / diceCount);
  const remainder = desiredTotal % diceCount;

  return Array.from({ length: diceCount }, (_, index) =>
    baseValue + (index < remainder ? 1 : 0),
  ).sort((left, right) => right - left);
}
