const GAME_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface RoundParticipant {
  id: string;
  seatOrder: number;
  bankruptAtTurn: number | null;
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function toDateKey(parts: DateParts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function formatDateKeyFromDate(date: Date) {
  return toDateKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

export function isValidGameDateKey(value: string | null | undefined): value is string {
  return Boolean(value && GAME_DATE_PATTERN.test(value));
}

export function parseDateKey(dateKey: string): DateParts {
  if (!isValidGameDateKey(dateKey)) {
    throw new Error(`无效的游戏日期：${dateKey}`);
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateKeyFromDate(date);
}

export function getTurnDateKey(calendarStartDate: string, turnNumber: number) {
  return addDaysToDateKey(calendarStartDate, Math.max(0, turnNumber - 1));
}

export function getRoundDateKey(calendarStartDate: string, roundNumber: number) {
  return addDaysToDateKey(calendarStartDate, Math.max(0, roundNumber - 1));
}

export function getRoundNumberForTurn(
  turnNumber: number,
  participants: RoundParticipant[],
) {
  const orderedParticipants = [...participants].sort(
    (left, right) => left.seatOrder - right.seatOrder,
  );

  if (orderedParticipants.length === 0 || turnNumber <= 1) {
    return 1;
  }

  let roundNumber = 1;
  let currentParticipant = orderedParticipants[0];

  for (let currentTurn = 1; currentTurn < turnNumber; currentTurn += 1) {
    const currentIndex = orderedParticipants.findIndex(
      (participant) => participant.id === currentParticipant.id,
    );

    if (currentIndex < 0) {
      return roundNumber;
    }

    let nextParticipant: RoundParticipant | null = null;

    for (
      let offset = 1;
      offset <= orderedParticipants.length;
      offset += 1
    ) {
      const candidate =
        orderedParticipants[(currentIndex + offset) % orderedParticipants.length];
      if (
        candidate.bankruptAtTurn === null ||
        candidate.bankruptAtTurn > currentTurn
      ) {
        nextParticipant = candidate;
        break;
      }
    }

    if (!nextParticipant) {
      return roundNumber;
    }

    if (nextParticipant.seatOrder <= currentParticipant.seatOrder) {
      roundNumber += 1;
    }

    currentParticipant = nextParticipant;
  }

  return roundNumber;
}

export function isFirstDayOfMonth(dateKey: string) {
  return parseDateKey(dateKey).day === 1;
}

export function isWeekendDateKey(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
}

export function calculateMonthlySavingsInterest(bankSavings: number) {
  return Math.floor(Math.max(0, bankSavings) * 0.1);
}

export function formatGameDateLabel(dateKey: string) {
  const { year, month, day } = parseDateKey(dateKey);
  return `${year}年${month}月${day}日`;
}

export function resolveCalendarStartDate(
  storedCalendarStartDate: string | null | undefined,
  fallbackDate: Date,
) {
  return isValidGameDateKey(storedCalendarStartDate)
    ? storedCalendarStartDate
    : formatDateKeyFromDate(fallbackDate);
}
