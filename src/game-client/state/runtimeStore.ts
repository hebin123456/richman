import type { RoomListItemView, RoomSnapshotView } from "@/lib/game/types";

export interface HomeRoute {
  kind: "home";
}

export interface RoomRoute {
  kind: "room";
  roomCode: string;
}

export type ClientRoute = HomeRoute | RoomRoute;
export type RuntimeView = "home" | "lobby" | "match";

export interface GameClientState {
  route: ClientRoute;
  snapshot: RoomSnapshotView | null;
  openRooms: RoomListItemView[];
  focusedTileIndex: number | null;
  loading: boolean;
  loadingRoomList: boolean;
  busy: boolean;
  connected: boolean;
  errorMessage: string | null;
  playerToken: string;
  initialized: boolean;
}

type StateListener = (state: GameClientState) => void;

export class RuntimeStore {
  private state: GameClientState;

  private readonly listeners = new Set<StateListener>();

  constructor(initialRoute: ClientRoute) {
    this.state = {
      route: initialRoute,
      snapshot: null,
      openRooms: [],
      focusedTileIndex: null,
      loading: initialRoute.kind === "room",
      loadingRoomList: initialRoute.kind === "home",
      busy: false,
      connected: false,
      errorMessage: null,
      playerToken: "",
      initialized: false,
    };
  }

  getState() {
    return this.state;
  }

  setState(nextState: GameClientState) {
    this.state = nextState;
    this.emit();
  }

  patchState(patch: Partial<GameClientState>) {
    this.state = {
      ...this.state,
      ...patch,
    };
    this.emit();
  }

  subscribe(listener: StateListener) {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export function getRuntimeView(state: GameClientState): RuntimeView {
  if (state.route.kind === "home") {
    return "home";
  }

  if (state.snapshot?.game && state.snapshot.status !== "LOBBY") {
    return "match";
  }

  return "lobby";
}
