export const LOTTERY_TICKET_PRICE = 200;

export const LOTTERY_BASE_JACKPOT = 600;

export const LOTTERY_DRAW_INTERVAL = 4;

export interface LotteryOption {
  number: number;
  label: string;
  shortLabel: string;
  colorKey: string;
  colorHex: string;
}

export interface LotteryTicketRecord {
  playerId: string;
  number: number;
  purchasedAtTurn: number;
}

export interface LotteryDrawPayout {
  playerId: string;
  ticketCount: number;
  amount: number;
}

export interface LotteryDrawResult {
  winningNumber: number;
  matchingTickets: LotteryTicketRecord[];
  payoutPerTicket: number;
  payouts: LotteryDrawPayout[];
  remainder: number;
}

export const LOTTERY_OPTIONS: LotteryOption[] = [
  { number: 1, label: "红 1 号", shortLabel: "红1", colorKey: "red", colorHex: "#ef4444" },
  { number: 2, label: "橙 2 号", shortLabel: "橙2", colorKey: "orange", colorHex: "#f97316" },
  { number: 3, label: "黄 3 号", shortLabel: "黄3", colorKey: "yellow", colorHex: "#eab308" },
  { number: 4, label: "绿 4 号", shortLabel: "绿4", colorKey: "green", colorHex: "#22c55e" },
  { number: 5, label: "蓝 5 号", shortLabel: "蓝5", colorKey: "blue", colorHex: "#3b82f6" },
  { number: 6, label: "紫 6 号", shortLabel: "紫6", colorKey: "violet", colorHex: "#8b5cf6" },
];

const LOTTERY_OPTION_MAP = new Map(LOTTERY_OPTIONS.map((option) => [option.number, option]));

export function getLotteryOption(number: number) {
  return LOTTERY_OPTION_MAP.get(number) ?? null;
}

export function parseLotteryTickets(serializedTickets: string | null | undefined) {
  if (!serializedTickets) {
    return [] as LotteryTicketRecord[];
  }

  try {
    const parsed = JSON.parse(serializedTickets) as LotteryTicketRecord[];
    return Array.isArray(parsed) ? parsed.filter((ticket) => Number.isInteger(ticket.number)) : [];
  } catch {
    return [];
  }
}

export function serializeLotteryTickets(tickets: LotteryTicketRecord[]) {
  return JSON.stringify(tickets);
}

export function resolveLotteryDraw(
  tickets: LotteryTicketRecord[],
  jackpot: number,
  winningNumber: number,
): LotteryDrawResult {
  const matchingTickets = tickets.filter((ticket) => ticket.number === winningNumber);
  const payoutPerTicket =
    matchingTickets.length > 0 ? Math.floor(jackpot / matchingTickets.length) : 0;
  const remainder = jackpot - payoutPerTicket * matchingTickets.length;
  const payoutByPlayer = new Map<string, LotteryDrawPayout>();

  matchingTickets.forEach((ticket) => {
    const current =
      payoutByPlayer.get(ticket.playerId) ??
      ({ playerId: ticket.playerId, ticketCount: 0, amount: 0 } satisfies LotteryDrawPayout);
    current.ticketCount += 1;
    current.amount += payoutPerTicket;
    payoutByPlayer.set(ticket.playerId, current);
  });

  return {
    winningNumber,
    matchingTickets,
    payoutPerTicket,
    payouts: [...payoutByPlayer.values()].sort((left, right) => right.amount - left.amount),
    remainder,
  };
}
