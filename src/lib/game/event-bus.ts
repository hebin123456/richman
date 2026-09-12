export interface RoomEventEnvelope {
  type: "room-updated";
  roomCode: string;
  sequence: number;
  eventType: string;
  summary: string;
}

type RoomSubscriber = (event: RoomEventEnvelope) => void;

class RoomEventBus {
  private subscribers = new Map<string, Set<RoomSubscriber>>();

  subscribe(roomCode: string, subscriber: RoomSubscriber) {
    const key = roomCode.toUpperCase();
    const listeners = this.subscribers.get(key) ?? new Set<RoomSubscriber>();
    listeners.add(subscriber);
    this.subscribers.set(key, listeners);

    return () => {
      const current = this.subscribers.get(key);
      if (!current) {
        return;
      }

      current.delete(subscriber);

      if (current.size === 0) {
        this.subscribers.delete(key);
      }
    };
  }

  publish(roomCode: string, event: RoomEventEnvelope) {
    const key = roomCode.toUpperCase();
    const listeners = this.subscribers.get(key);
    if (!listeners) {
      return;
    }

    listeners.forEach((subscriber) => subscriber(event));
  }
}

const globalForRoomBus = globalThis as unknown as {
  roomEventBus: RoomEventBus | undefined;
};

export const roomEventBus =
  globalForRoomBus.roomEventBus ?? new RoomEventBus();

if (process.env.NODE_ENV !== "production") {
  globalForRoomBus.roomEventBus = roomEventBus;
}
