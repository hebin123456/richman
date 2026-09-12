import { NextResponse } from "next/server";

import { isGameEngineError } from "@/lib/game/engine";

export function apiErrorResponse(error: unknown) {
  if (isGameEngineError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json(
    { error: "服务器开小差了，请稍后重试。" },
    { status: 500 },
  );
}
