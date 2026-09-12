export type RecoveryRecipientKind = "player" | "bank" | "tax";
export type RecoveryContinuation = "postAction" | "waitForRoll" | "turnStart";

export interface RecoveryContextData {
  amountDue: number;
  reason: string;
  recipientKind: RecoveryRecipientKind;
  recipientPlayerId: string | null;
  continuation: RecoveryContinuation;
  successSummary: string;
  bankruptcySummary: string;
  clearBankDebtOnSuccess?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRecipientKind(value: unknown): value is RecoveryRecipientKind {
  return value === "player" || value === "bank" || value === "tax";
}

function isContinuation(value: unknown): value is RecoveryContinuation {
  return value === "postAction" || value === "waitForRoll" || value === "turnStart";
}

export function serializeRecoveryContext(context: RecoveryContextData) {
  return JSON.stringify(context);
}

export function parseRecoveryContext(
  value: string | null | undefined,
): RecoveryContextData | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!isObject(parsed)) {
      return null;
    }

    const amountDue = parsed.amountDue;
    const reason = parsed.reason;
    const recipientKind = parsed.recipientKind;
    const recipientPlayerId = parsed.recipientPlayerId;
    const continuation = parsed.continuation;
    const successSummary = parsed.successSummary;
    const bankruptcySummary = parsed.bankruptcySummary;
    const clearBankDebtOnSuccess = parsed.clearBankDebtOnSuccess;

    if (
      typeof amountDue !== "number" ||
      !Number.isInteger(amountDue) ||
      amountDue <= 0 ||
      typeof reason !== "string" ||
      !isRecipientKind(recipientKind) ||
      !(typeof recipientPlayerId === "string" || recipientPlayerId === null) ||
      !isContinuation(continuation) ||
      typeof successSummary !== "string" ||
      typeof bankruptcySummary !== "string" ||
      !(
        typeof clearBankDebtOnSuccess === "boolean" ||
        clearBankDebtOnSuccess === undefined
      )
    ) {
      return null;
    }

    return {
      amountDue,
      reason,
      recipientKind,
      recipientPlayerId,
      continuation,
      successSummary,
      bankruptcySummary,
      clearBankDebtOnSuccess,
    };
  } catch {
    return null;
  }
}
