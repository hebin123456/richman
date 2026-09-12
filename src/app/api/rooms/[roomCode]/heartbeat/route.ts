import { NextResponse, type NextRequest } from "next/server";

import { refreshCurrentTurnHeartbeat } from "@/lib/game/autoplay";
import { recordPlayerHeartbeat } from "@/lib/game/engine";
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

    const result = await recordPlayerHeartbeat(roomCode, token);
    await refreshCurrentTurnHeartbeat(result.roomCode, result.playerId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
