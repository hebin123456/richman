import type { GamePhase } from "@prisma/client";
import type { GodKey } from "@/lib/game/gods";
import type { RecoveryContextData } from "@/lib/game/recovery";

export type ReactionItemKey = "freePassCard" | "innocenceCard";
export type ReactionContextKind = "payment" | "taxAudit" | "debuff";
export type DebuffReactionType = "sabotage" | "sleepwalk";

interface BaseReactionContextData {
  kind: ReactionContextKind;
  reactingPlayerId: string;
  turnPlayerId: string;
  itemKeys: ReactionItemKey[];
}

export interface PaymentReactionContextData extends BaseReactionContextData {
  kind: "payment";
  recovery: RecoveryContextData;
}

export interface TaxAuditReactionContextData extends BaseReactionContextData {
  kind: "taxAudit";
  sourcePlayerId: string;
  sourcePlayerName: string;
  itemName: string;
  amount: number;
  returnPhase: GamePhase;
}

export interface DebuffReactionContextData extends BaseReactionContextData {
  kind: "debuff";
  sourcePlayerId: string;
  sourcePlayerName: string;
  itemName: string;
  debuffType: DebuffReactionType;
  returnPhase: GamePhase;
  sleepwalkingTurns?: number;
  godKey?: GodKey;
}

export type ReactionContextData =
  | PaymentReactionContextData
  | TaxAuditReactionContextData
  | DebuffReactionContextData;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReactionItemKey(value: unknown): value is ReactionItemKey {
  return value === "freePassCard" || value === "innocenceCard";
}

function isReactionKind(value: unknown): value is ReactionContextKind {
  return value === "payment" || value === "taxAudit" || value === "debuff";
}

function isDebuffReactionType(value: unknown): value is DebuffReactionType {
  return value === "sabotage" || value === "sleepwalk";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGamePhaseValue(value: unknown): value is GamePhase {
  return typeof value === "string";
}

export function serializeReactionContext(context: ReactionContextData) {
  return JSON.stringify(context);
}

export function parseReactionContext(value: string | null | undefined): ReactionContextData | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isObject(parsed)) {
      return null;
    }

    const reactingPlayerId = parsed.reactingPlayerId;
    const turnPlayerId = parsed.turnPlayerId;
    const itemKeys = parsed.itemKeys;
    const kind = parsed.kind;
    if (
      typeof reactingPlayerId !== "string" ||
      typeof turnPlayerId !== "string" ||
      !isReactionKind(kind) ||
      !isStringArray(itemKeys) ||
      !itemKeys.every(isReactionItemKey)
    ) {
      return null;
    }

    if (kind === "payment") {
      const recovery = parsed.recovery;
      if (!isObject(recovery)) {
        return null;
      }

      const amountDue = recovery.amountDue;
      const reason = recovery.reason;
      const recipientKind = recovery.recipientKind;
      const recipientPlayerId = recovery.recipientPlayerId;
      const continuation = recovery.continuation;
      const successSummary = recovery.successSummary;
      const bankruptcySummary = recovery.bankruptcySummary;
      const clearBankDebtOnSuccess = recovery.clearBankDebtOnSuccess;

      if (
        typeof amountDue !== "number" ||
        typeof reason !== "string" ||
        typeof recipientKind !== "string" ||
        (recipientPlayerId !== null && typeof recipientPlayerId !== "string") ||
        typeof continuation !== "string" ||
        typeof successSummary !== "string" ||
        typeof bankruptcySummary !== "string" ||
        (clearBankDebtOnSuccess !== undefined && typeof clearBankDebtOnSuccess !== "boolean")
      ) {
        return null;
      }

      return {
        kind,
        reactingPlayerId,
        turnPlayerId,
        itemKeys,
        recovery: {
          amountDue,
          reason,
          recipientKind: recipientKind as RecoveryContextData["recipientKind"],
          recipientPlayerId,
          continuation: continuation as RecoveryContextData["continuation"],
          successSummary,
          bankruptcySummary,
          clearBankDebtOnSuccess,
        },
      };
    }

    const sourcePlayerId = parsed.sourcePlayerId;
    const sourcePlayerName = parsed.sourcePlayerName;
    const itemName = parsed.itemName;
    const returnPhase = parsed.returnPhase;
    if (
      typeof sourcePlayerId !== "string" ||
      typeof sourcePlayerName !== "string" ||
      typeof itemName !== "string" ||
      !isGamePhaseValue(returnPhase)
    ) {
      return null;
    }

    if (kind === "taxAudit") {
      const amount = parsed.amount;
      if (typeof amount !== "number") {
        return null;
      }

      return {
        kind,
        reactingPlayerId,
        turnPlayerId,
        itemKeys,
        sourcePlayerId,
        sourcePlayerName,
        itemName,
        amount,
        returnPhase,
      };
    }

    const debuffType = parsed.debuffType;
    const sleepwalkingTurns = parsed.sleepwalkingTurns;
    const godKey = parsed.godKey;
    if (
      !isDebuffReactionType(debuffType) ||
      (sleepwalkingTurns !== undefined && typeof sleepwalkingTurns !== "number") ||
      (godKey !== undefined && typeof godKey !== "string")
    ) {
      return null;
    }

    return {
      kind,
      reactingPlayerId,
      turnPlayerId,
      itemKeys,
      sourcePlayerId,
      sourcePlayerName,
      itemName,
      debuffType,
      returnPhase,
      sleepwalkingTurns,
      godKey: godKey as GodKey | undefined,
    };
  } catch {
    return null;
  }
}
