import { NextResponse, type NextRequest } from "next/server";

import { addBotPlayer } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";
import { getPlayerToken } from "@/lib/session/player-session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    const { roomCode } = await context.params;
    const token = getPlayerToken(request);
    if (!token) {
      return NextResponse.json({ error: "缺少玩家凭证。" }, { status: 401 });
    }

    const snapshot = await addBotPlayer(roomCode, token);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
