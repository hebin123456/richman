import { RoomGateway } from "@/game-client/net/roomGateway";
import { GameAudioManager } from "@/game-client/phaser/audioManager";
import {
  RuntimeStore,
  type ClientRoute,
  type GameClientState,
} from "@/game-client/state/runtimeStore";
import { withBasePath } from "@/lib/base-path";
import type { GameActionRequest, RoomSettingsInput } from "@/lib/game/types";

type LobbyPatchPayload = {
  characterId?: string;
  isReady?: boolean;
};

const HEARTBEAT_INTERVAL_MS = 10000;

export class GameRuntime {
  private readonly store: RuntimeStore;

  private readonly gateway = new RoomGateway();

  readonly audio = new GameAudioManager();

  private stopRoomEvents: (() => void) | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(initialRoute: ClientRoute) {
    this.store = new RuntimeStore(initialRoute);
  }

  getState() {
    return this.store.getState();
  }

  subscribe(listener: (state: GameClientState) => void) {
    return this.store.subscribe(listener);
  }

  async start() {
    await this.applyRoute(this.store.getState().route);
  }

  async setRoute(route: ClientRoute) {
    const current = this.store.getState().route;
    const sameRoute =
      current.kind === route.kind &&
      (current.kind === "home" ||
        (current.kind === "room" && route.kind === "room" && current.roomCode === route.roomCode));

    if (sameRoute) {
      return;
    }

    await this.applyRoute(route);
  }

  private async applyRoute(route: ClientRoute) {
    this.cleanupRoomSubscription();
    this.store.patchState({
      route,
      errorMessage: null,
      focusedTileIndex: null,
      initialized: true,
    });

    if (route.kind === "home") {
      this.store.patchState({
        snapshot: null,
        openRooms: [],
        focusedTileIndex: null,
        loading: false,
        loadingRoomList: true,
        busy: false,
        connected: false,
        playerToken: "",
      });
      await this.refreshOpenRooms();
      return;
    }

    const playerToken = this.gateway.resolveStoredToken(route.roomCode);
    this.store.patchState({
      snapshot: null,
      openRooms: [],
      focusedTileIndex: null,
      loading: true,
      loadingRoomList: false,
      busy: false,
      connected: false,
      playerToken,
    });

    this.stopRoomEvents = this.gateway.connectRoomEvents(
      route.roomCode,
      () => {
        void this.refreshRoom(false);
      },
      (connected) => {
        this.store.patchState({ connected });
      },
    );

    await this.refreshRoom(true);
    this.startHeartbeatLoop();
  }

  private currentRoomCode() {
    const route = this.store.getState().route;
    if (route.kind !== "room") {
      throw new Error("当前没有有效的房间路由。");
    }

    return route.roomCode;
  }

  private async refreshRoom(showLoading: boolean) {
    const state = this.store.getState();
    if (state.route.kind !== "room") {
      return;
    }

    if (showLoading) {
      this.store.patchState({ loading: true });
    }

    try {
      const snapshot = await this.gateway.loadRoomSnapshot(
        state.route.roomCode,
        state.playerToken,
      );
      this.store.patchState({
        snapshot,
        errorMessage: null,
      });
    } catch (error) {
      this.store.patchState({
        errorMessage:
          error instanceof Error ? error.message : "房间加载失败。",
      });
    } finally {
      this.store.patchState({ loading: false });
    }
  }

  private async runMutation<T>(
    callback: () => Promise<T>,
    onSuccess: (result: T) => void,
  ) {
    this.store.patchState({
      busy: true,
      errorMessage: null,
    });

    try {
      const result = await callback();
      onSuccess(result);
      return result;
    } catch (error) {
      this.store.patchState({
        errorMessage:
          error instanceof Error ? error.message : "请求失败。",
      });
      return null;
    } finally {
      this.store.patchState({ busy: false });
    }
  }

  async createRoom(input: {
    hostName: string;
    characterId: string;
    settings: Partial<RoomSettingsInput>;
  }) {
    const result = await this.runMutation(
      () => this.gateway.createRoom(input),
      (payload) => {
        this.gateway.storeToken(payload.roomCode, payload.token);
      },
    );

    if (result) {
      this.audio.play("open");
      window.location.assign(withBasePath(`/rooms/${result.roomCode}?token=${result.token}`));
    }
  }

  async joinFromHome(input: {
    roomCode: string;
    playerName: string;
    characterId: string;
  }) {
    const roomCode = input.roomCode.trim().toUpperCase();

    const result = await this.runMutation(
      () =>
        this.gateway.joinRoom(roomCode, {
          playerName: input.playerName,
          characterId: input.characterId,
        }),
      (payload) => {
        this.gateway.storeToken(payload.roomCode, payload.token);
      },
    );

    if (result) {
      this.audio.play("open");
      window.location.assign(withBasePath(`/rooms/${result.roomCode}?token=${result.token}`));
    }
  }

  async refreshOpenRooms() {
    if (this.store.getState().route.kind !== "home") {
      return;
    }

    this.store.patchState({
      loadingRoomList: true,
    });

    try {
      const result = await this.gateway.loadJoinableRooms();
      if (this.store.getState().route.kind !== "home") {
        return;
      }
      this.store.patchState({
        openRooms: result.rooms,
        errorMessage: null,
      });
    } catch (error) {
      if (this.store.getState().route.kind !== "home") {
        return;
      }
      this.store.patchState({
        errorMessage:
          error instanceof Error ? error.message : "房间列表加载失败。",
      });
    } finally {
      if (this.store.getState().route.kind !== "home") {
        return;
      }
      this.store.patchState({
        loadingRoomList: false,
      });
    }
  }

  async joinCurrentRoom(playerName: string, characterId: string) {
    const roomCode = this.currentRoomCode();
    const result = await this.runMutation(
      () =>
        this.gateway.joinRoom(roomCode, {
          playerName,
          characterId,
        }),
      (payload) => {
        this.gateway.storeToken(payload.roomCode, payload.token);
        this.store.patchState({
          playerToken: payload.token,
          snapshot: payload.snapshot,
          errorMessage: null,
        });
      },
    );

    if (result) {
      this.audio.play("open");
    }
  }

  async patchLobby(payload: LobbyPatchPayload) {
    const roomCode = this.currentRoomCode();
    const state = this.store.getState();
    await this.runMutation(
      () => this.gateway.patchLobby(roomCode, state.playerToken, payload),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );
  }

  async saveSettings(payload: RoomSettingsInput) {
    const roomCode = this.currentRoomCode();
    const state = this.store.getState();
    await this.runMutation(
      () => this.gateway.saveSettings(roomCode, state.playerToken, payload),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );
  }

  async startGame() {
    const roomCode = this.currentRoomCode();
    const state = this.store.getState();
    const result = await this.runMutation(
      () => this.gateway.startGame(roomCode, state.playerToken),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );

    if (result) {
      this.audio.play("open");
    }
  }

  async addBotPlayer() {
    const roomCode = this.currentRoomCode();
    const state = this.store.getState();
    await this.runMutation(
      () => this.gateway.addBotPlayer(roomCode, state.playerToken),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );
  }

  async removeBotPlayer(playerId: string) {
    const roomCode = this.currentRoomCode();
    const state = this.store.getState();
    await this.runMutation(
      () => this.gateway.removeBotPlayer(roomCode, state.playerToken, playerId),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );
  }

  async setManagedMode(managed: boolean) {
    const roomCode = this.currentRoomCode();
    const state = this.store.getState();
    await this.runMutation(
      () => this.gateway.setManagedMode(roomCode, state.playerToken, managed),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );
  }

  async performGameAction(action: Omit<GameActionRequest, "clientVersion">) {
    const state = this.store.getState();
    const gameId = state.snapshot?.game?.id;
    const clientVersion = state.snapshot?.game?.version;

    if (!gameId || typeof clientVersion !== "number") {
      return;
    }

    const result = await this.runMutation(
      () =>
        this.gateway.postGameAction(gameId, state.playerToken, {
          ...action,
          clientVersion,
        }),
      (snapshot) => {
        this.store.patchState({
          snapshot,
          errorMessage: null,
        });
      },
    );

    if (result) {
      if (action.type === "rollDice") {
        this.audio.play("dice");
      } else if (action.type === "endTurn") {
        this.audio.play("move");
      }
    }
  }

  focusTile(tileIndex: number | null) {
    if (this.store.getState().focusedTileIndex === tileIndex) {
      return;
    }

    this.store.patchState({
      focusedTileIndex: tileIndex,
    });
  }

  toggleAudio() {
    this.audio.toggle();
    this.store.patchState({
      ...this.store.getState(),
    });
  }

  navigateHome() {
    window.location.assign(withBasePath("/"));
  }

  destroy() {
    this.cleanupRoomSubscription();
    this.gateway.destroy();
  }

  private cleanupRoomSubscription() {
    this.stopHeartbeatLoop();
    if (this.stopRoomEvents) {
      this.stopRoomEvents();
      this.stopRoomEvents = null;
    }
  }

  private startHeartbeatLoop() {
    this.stopHeartbeatLoop();

    const state = this.store.getState();
    if (state.route.kind !== "room" || !state.playerToken) {
      return;
    }

    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeatLoop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat() {
    const state = this.store.getState();
    if (state.route.kind !== "room" || !state.playerToken) {
      return;
    }

    try {
      await this.gateway.sendHeartbeat(state.route.roomCode, state.playerToken);
    } catch {
      // Heartbeat failures should not interrupt gameplay flow.
    }
  }
}
