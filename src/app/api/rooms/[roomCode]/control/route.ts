import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { scheduleRoomAutomation } from "@/lib/game/autoplay";
import { updateManagedMode } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";
import { getPlayerToken } from "@/lib/session/player-session";

const controlSchema = z.object({
  managed: z.boolean(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    const { roomCode } = await context.params;
    const token = getPlayerToken(request);
    if (!token) {
      return NextResponse.json({ error: "缺少玩家凭证。" }, { status: 401 });
    }

    const payload = controlSchema.parse(await request.json());
    const snapshot = await updateManagedMode(roomCode, token, payload.managed);
    if (snapshot.game && snapshot.currentPlayer?.id === snapshot.game.currentPlayerId) {
      scheduleRoomAutomation(snapshot.code);
    }
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
