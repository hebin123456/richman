import { NextResponse } from "next/server";
import { z } from "zod";

import { joinRoom } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";

const joinRoomSchema = z.object({
  playerName: z.string().min(2).max(16),
  characterId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    const { roomCode } = await context.params;
    const payload = joinRoomSchema.parse(await request.json());
    const result = await joinRoom({
      roomCode,
      ...payload,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
