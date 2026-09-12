import { customAlphabet } from "nanoid";
import type { NextRequest } from "next/server";

export const PLAYER_TOKEN_HEADER = "x-player-token";
export const ROOM_CODE_LENGTH = 4;

const roomCodeAlphabet = customAlphabet("0123456789", ROOM_CODE_LENGTH);
const playerTokenAlphabet = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  24,
);

export function createRoomCode() {
  return roomCodeAlphabet();
}

export function createPlayerToken() {
  return playerTokenAlphabet();
}

export function getPlayerToken(request: NextRequest) {
  return (
    request.headers.get(PLAYER_TOKEN_HEADER) ??
    request.nextUrl.searchParams.get("token") ??
    null
  );
}

export function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
}

export function normalizePlayerName(name: string) {
  return name.trim().slice(0, 16);
}
