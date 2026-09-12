import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { purgeExpiredRooms, updateLobbyPlayer } from "@/lib/game/engine";
import { loadRoomSnapshot } from "@/lib/game/snapshot";
import { apiErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/db";
import { getPlayerToken } from "@/lib/session/player-session";

const lobbyUpdateSchema = z.object({
  characterId: z.string().min(1).optional(),
  isReady: z.boolean().optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    const { roomCode } = await context.params;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    await purgeExpiredRooms(prisma);
    const snapshot = await loadRoomSnapshot(prisma, roomCode, token);

    if (!snapshot) {
      return NextResponse.json({ error: "房间不存在。" }, { status: 404 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

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

    const payload = lobbyUpdateSchema.parse(await request.json());
    const snapshot = await updateLobbyPlayer(roomCode, token, payload);
    return NextResponse.json(snapshot);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
