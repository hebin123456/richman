import type {
  GameActionRequest,
  RoomListItemView,
  RoomSettingsInput,
  RoomSnapshotView,
} from "@/lib/game/types";
import { withBasePath } from "@/lib/base-path";
import { PLAYER_TOKEN_HEADER } from "@/lib/session/player-session";

interface CreateRoomPayload {
  hostName: string;
  characterId: string;
  settings?: Partial<RoomSettingsInput>;
}

interface JoinRoomPayload {
  playerName: string;
  characterId: string;
}

interface CreateRoomResult {
  roomCode: string;
  token: string;
  snapshot: RoomSnapshotView;
}

interface JoinRoomResult {
  roomCode: string;
  token: string;
  snapshot: RoomSnapshotView;
}

interface RoomListResult {
  rooms: RoomListItemView[];
}

interface HeartbeatResult {
  ok: boolean;
}

type RoomEventListener = (connected: boolean) => void;
type RoomUpdateListener = () => void;

export class RoomGateway {
  private source: EventSource | null = null;

  private storageKey(roomCode: string) {
    return `richman:token:${roomCode.toUpperCase()}`;
  }

  private async callJson<T>(url: string, init: RequestInit) {
    const response = await fetch(url, init);
    const result = (await response.json()) as T & { error?: string };

    if (!response.ok) {
      throw new Error(result.error ?? "请求失败。");
    }

    return result;
  }

  resolveStoredToken(roomCode: string) {
    if (typeof window === "undefined") {
      return "";
    }

    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("token") ?? "";
    const storageToken =
      window.localStorage.getItem(this.storageKey(roomCode)) ?? "";
    const token = queryToken || storageToken;

    if (token) {
      window.localStorage.setItem(this.storageKey(roomCode), token);
      if (queryToken) {
        window.history.replaceState({}, "", withBasePath(`/rooms/${roomCode}`));
      }
    }

    return token;
  }

  storeToken(roomCode: string, token: string) {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(this.storageKey(roomCode), token);
  }

  async loadRoomSnapshot(roomCode: string, playerToken = "") {
    const query = playerToken ? `?token=${encodeURIComponent(playerToken)}` : "";
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/rooms/${roomCode}${query}`), {
      cache: "no-store",
    });
  }

  async loadJoinableRooms() {
    return this.callJson<RoomListResult>(withBasePath("/api/rooms"), {
      cache: "no-store",
    });
  }

  connectRoomEvents(
    roomCode: string,
    onRoomUpdated: RoomUpdateListener,
    onConnectionChange: RoomEventListener,
  ) {
    this.disconnectRoomEvents();

    const source = new EventSource(withBasePath(`/api/rooms/${roomCode}/events`));
    source.onopen = () => onConnectionChange(true);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type?: string };
        if (payload.type === "room-updated") {
          onRoomUpdated();
        }
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    source.onerror = () => {
      onConnectionChange(false);
      source.close();
      if (this.source === source) {
        this.source = null;
      }
    };

    this.source = source;

    return () => {
      if (this.source === source) {
        this.source = null;
      }
      onConnectionChange(false);
      source.close();
    };
  }

  disconnectRoomEvents() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

  async createRoom(payload: CreateRoomPayload) {
    return this.callJson<CreateRoomResult>(withBasePath("/api/rooms"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  async joinRoom(roomCode: string, payload: JoinRoomPayload) {
    return this.callJson<JoinRoomResult>(withBasePath(`/api/rooms/${roomCode}/join`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  async patchLobby(
    roomCode: string,
    playerToken: string,
    payload: { characterId?: string; isReady?: boolean },
  ) {
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/rooms/${roomCode}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
      body: JSON.stringify(payload),
    });
  }

  async saveSettings(
    roomCode: string,
    playerToken: string,
    payload: RoomSettingsInput,
  ) {
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/rooms/${roomCode}/settings`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
      body: JSON.stringify(payload),
    });
  }

  async startGame(roomCode: string, playerToken: string) {
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/rooms/${roomCode}/start`), {
      method: "POST",
      headers: {
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
    });
  }

  async postGameAction(
    gameId: string,
    playerToken: string,
    payload: Omit<GameActionRequest, "clientVersion"> & { clientVersion: number },
  ) {
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/games/${gameId}/actions`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
      body: JSON.stringify(payload),
    });
  }

  async addBotPlayer(roomCode: string, playerToken: string) {
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/rooms/${roomCode}/bots`), {
      method: "POST",
      headers: {
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
    });
  }

  async removeBotPlayer(roomCode: string, playerToken: string, playerId: string) {
    return this.callJson<RoomSnapshotView>(
      withBasePath(`/api/rooms/${roomCode}/bots/${playerId}`),
      {
        method: "DELETE",
        headers: {
          [PLAYER_TOKEN_HEADER]: playerToken,
        },
      },
    );
  }

  async setManagedMode(roomCode: string, playerToken: string, managed: boolean) {
    return this.callJson<RoomSnapshotView>(withBasePath(`/api/rooms/${roomCode}/control`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
      body: JSON.stringify({ managed }),
    });
  }

  async sendHeartbeat(roomCode: string, playerToken: string) {
    return this.callJson<HeartbeatResult>(withBasePath(`/api/rooms/${roomCode}/heartbeat`), {
      method: "POST",
      headers: {
        [PLAYER_TOKEN_HEADER]: playerToken,
      },
    });
  }

  destroy() {
    this.disconnectRoomEvents();
  }
}
