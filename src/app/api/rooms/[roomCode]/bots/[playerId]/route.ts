import { NextResponse, type NextRequest } from "next/server";

import { removeBotPlayer } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";
import { getPlayerToken } from "@/lib/session/player-session";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ roomCode: string; playerId: string }> },
) {
  try {
    const { roomCode, playerId } = await context.params;
    const token = getPlayerToken(request);
    if (!token) {
      return NextResponse.json({ error: "缺少玩家凭证。" }, { status: 401 });
    }

    const snapshot = await removeBotPlayer(roomCode, token, playerId);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
