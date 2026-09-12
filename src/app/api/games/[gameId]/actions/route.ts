import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { scheduleRoomAutomation } from "@/lib/game/autoplay";
import { performGameAction } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";
import { getPlayerToken } from "@/lib/session/player-session";

const actionSchema = z.object({
  type: z.enum([
    "rollDice",
    "buyProperty",
    "skipPurchase",
    "declineReaction",
    "buyItem",
    "skipShop",
    "buyLotteryTicket",
    "skipLottery",
    "manageBank",
    "skipBank",
    "castMagic",
    "skipMagic",
    "playAmusement",
    "endTurn",
    "payJailFine",
    "useJailFreeCard",
    "buildHouse",
    "mortgage",
    "unmortgage",
    "buyStock",
    "sellStock",
    "useItem",
    "declareBankruptcy",
  ]),
  clientVersion: z.number().int().optional(),
  diceCount: z.number().int().positive().optional(),
  controlledRollTotal: z.number().int().positive().optional(),
  tileIndex: z.number().int().optional(),
  stockSymbol: z.string().min(1).optional(),
  shares: z.number().int().positive().optional(),
  itemKey: z.string().min(1).optional(),
  targetPlayerId: z.string().min(1).optional(),
  lotteryNumber: z.number().int().positive().optional(),
  bankChoice: z.string().min(1).optional(),
  magicKey: z.string().min(1).optional(),
  amusementChoice: z.string().min(1).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ gameId: string }> },
) {
  try {
    const token = getPlayerToken(request);
    if (!token) {
      return NextResponse.json({ error: "缺少玩家凭证。" }, { status: 401 });
    }

    const { gameId } = await context.params;
    const payload = actionSchema.parse(await request.json());
    const snapshot = await performGameAction(gameId, token, payload);
    scheduleRoomAutomation(snapshot.code);

    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
