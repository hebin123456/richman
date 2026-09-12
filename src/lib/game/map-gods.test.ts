import { describe, expect, it } from "vitest";

import {
  MAP_GOD_DURATION_TURNS,
  createRandomMapGodSpawn,
  getNearestMapGodSpawn,
  parseMapGodSpawns,
  serializeMapGodSpawns,
  stepMapGodSpawns,
} from "./map-gods";

describe("map gods", () => {
  it("parses and serializes valid spawns", () => {
    const serialized = serializeMapGodSpawns([
      {
        tileIndex: 1,
        godKey: "caishen",
        turnsRemaining: 3,
      },
    ]);

    expect(parseMapGodSpawns(serialized)).toEqual([
      {
        tileIndex: 1,
        godKey: "xiaoCaishen",
        turnsRemaining: 3,
      },
    ]);
  });

  it("drops expired spawns when stepping turns", () => {
    expect(
      stepMapGodSpawns([
        { tileIndex: 1, godKey: "xiaoCaishen", turnsRemaining: 2 },
        { tileIndex: 2, godKey: "xiaoFushen", turnsRemaining: 1 },
      ]),
    ).toEqual([{ tileIndex: 1, godKey: "xiaoCaishen", turnsRemaining: 1 }]);
  });

  it("creates a random spawn on an unoccupied eligible tile", () => {
    const spawn = createRandomMapGodSpawn([1, 2, 3], () => 0);

    expect(spawn).not.toBeNull();
    expect(spawn?.tileIndex).not.toBe(1);
    expect(spawn?.tileIndex).not.toBe(2);
    expect(spawn?.tileIndex).not.toBe(3);
    expect(spawn?.turnsRemaining).toBe(MAP_GOD_DURATION_TURNS);
  });

  it("selects the nearest map god around the board", () => {
    const nearest = getNearestMapGodSpawn(
      [
        { tileIndex: 9, godKey: "xiaoFushen", turnsRemaining: 3 },
        { tileIndex: 18, godKey: "xiaoCaishen", turnsRemaining: 3 },
        { tileIndex: 2, godKey: "xiaoShuaishen", turnsRemaining: 3 },
      ],
      0,
      20,
    );

    expect(nearest).toEqual({
      tileIndex: 2,
      godKey: "xiaoShuaishen",
      turnsRemaining: 3,
    });
  });
});
