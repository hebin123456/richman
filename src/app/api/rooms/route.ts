import { NextResponse } from "next/server";
import { z } from "zod";

import { createRoomWithHost, listJoinableRooms } from "@/lib/game/engine";
import { apiErrorResponse } from "@/lib/http";

const createRoomSchema = z.object({
  hostName: z.string().min(2).max(16),
  characterId: z.string().min(1),
  settings: z
    .object({
      startingCash: z.number().int().optional(),
      passStartSalary: z.number().int().optional(),
      maxPlayers: z.number().int().optional(),
      jailFine: z.number().int().optional(),
      parkingJackpotEnabled: z.boolean().optional(),
      stocksEnabled: z.boolean().optional(),
      turnSeconds: z.number().int().optional(),
    })
    .partial()
    .optional(),
});

export async function POST(request: Request) {
  try {
    const payload = createRoomSchema.parse(await request.json());
    const result = await createRoomWithHost(payload);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET() {
  try {
    const rooms = await listJoinableRooms();
    return NextResponse.json({ rooms });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
