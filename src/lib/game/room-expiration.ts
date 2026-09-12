export const ROOM_IDLE_EXPIRATION_MS = 60 * 60 * 1000;

interface RoomActivityInput {
  createdAt: Date;
  updatedAt?: Date | null;
  latestEventAt?: Date | null;
}

export function getLatestRoomActivityAt({
  createdAt,
  updatedAt,
  latestEventAt,
}: RoomActivityInput) {
  const timestamps = [
    createdAt.getTime(),
    updatedAt?.getTime() ?? 0,
    latestEventAt?.getTime() ?? 0,
  ];

  return new Date(Math.max(...timestamps));
}

export function isRoomExpired(input: RoomActivityInput, now = new Date()) {
  const latestActivityAt = getLatestRoomActivityAt(input);
  return now.getTime() - latestActivityAt.getTime() >= ROOM_IDLE_EXPIRATION_MS;
}
