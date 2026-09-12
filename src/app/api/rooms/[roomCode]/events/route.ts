import { NextResponse, type NextRequest } from "next/server";

import { roomEventBus } from "@/lib/game/event-bus";
import { prisma } from "@/lib/db";
import { purgeExpiredRooms } from "@/lib/game/engine";
import { loadRoomSnapshot } from "@/lib/game/snapshot";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await context.params;
  await purgeExpiredRooms(prisma);
  const snapshot = await loadRoomSnapshot(prisma, roomCode);
  if (!snapshot) {
    return NextResponse.json({ error: "房间不存在。" }, { status: 404 });
  }
  const encoder = new TextEncoder();

  let dispose = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      send({ type: "connected", roomCode });
      dispose = roomEventBus.subscribe(roomCode, (event) => {
        send(event);
      });

      heartbeat = setInterval(() => {
        send({ type: "heartbeat", roomCode, timestamp: Date.now() });
      }, 15000);

      request.signal.addEventListener("abort", () => {
        dispose();
        if (heartbeat) {
          clearInterval(heartbeat);
        }
      });
    },
    cancel() {
      dispose();
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
