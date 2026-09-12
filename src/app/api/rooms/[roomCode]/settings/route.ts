import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { updateRoomSettings } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";
import { getPlayerToken } from "@/lib/session/player-session";

const settingsSchema = z.object({
  startingCash: z.number().int().optional(),
  passStartSalary: z.number().int().optional(),
  maxPlayers: z.number().int().optional(),
  jailFine: z.number().int().optional(),
  parkingJackpotEnabled: z.boolean().optional(),
  stocksEnabled: z.boolean().optional(),
  turnSeconds: z.number().int().optional(),
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

    const payload = settingsSchema.parse(await request.json());
    const snapshot = await updateRoomSettings(roomCode, token, payload);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
