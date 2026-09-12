import { describe, expect, it } from "vitest";

import {
  ROOM_IDLE_EXPIRATION_MS,
  getLatestRoomActivityAt,
  isRoomExpired,
} from "./room-expiration";

describe("room expiration", () => {
  it("uses the most recent activity timestamp", () => {
    const createdAt = new Date("2026-05-05T08:00:00.000Z");
    const updatedAt = new Date("2026-05-05T08:10:00.000Z");
    const latestEventAt = new Date("2026-05-05T08:25:00.000Z");

    expect(
      getLatestRoomActivityAt({
        createdAt,
        updatedAt,
        latestEventAt,
      }).toISOString(),
    ).toBe(latestEventAt.toISOString());
  });

  it("expires rooms after one hour without activity", () => {
    const latestEventAt = new Date("2026-05-05T08:25:00.000Z");
    const now = new Date(latestEventAt.getTime() + ROOM_IDLE_EXPIRATION_MS);

    expect(
      isRoomExpired({
        createdAt: new Date("2026-05-05T08:00:00.000Z"),
        latestEventAt,
      }, now),
    ).toBe(true);
  });

  it("keeps rooms alive when recent activity exists", () => {
    const latestEventAt = new Date("2026-05-05T08:25:00.000Z");
    const now = new Date(latestEventAt.getTime() + ROOM_IDLE_EXPIRATION_MS - 1);

    expect(
      isRoomExpired({
        createdAt: new Date("2026-05-05T08:00:00.000Z"),
        latestEventAt,
      }, now),
    ).toBe(false);
  });
});
