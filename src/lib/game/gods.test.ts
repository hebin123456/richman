import { describe, expect, it } from "vitest";

import {
  GOD_DURATION_TURNS,
  getGodAttachRewardCount,
  getGodDefinition,
  getPurchaseHouseBonusByGod,
  getRandomBlessingGodKey,
  getRandomCurseGodKey,
  isCaishenGodKey,
  isFushenGodKey,
  isShuaishenGodKey,
  normalizeGodKey,
} from "./gods";

describe("gods", () => {
  it("normalizes legacy god keys to the new roster", () => {
    expect(normalizeGodKey("caishen")).toBe("xiaoCaishen");
    expect(normalizeGodKey("fushen")).toBe("xiaoFushen");
    expect(normalizeGodKey("shuaishen")).toBe("xiaoShuaishen");
    expect(getGodDefinition("caishen")?.name).toBe("小财神");
  });

  it("only picks blessing gods from the blessing pool", () => {
    const key = getRandomBlessingGodKey(() => 0);
    expect(getGodDefinition(key)?.alignment).toBe("good");
  });

  it("only picks curse gods from the curse pool", () => {
    const key = getRandomCurseGodKey(() => 0);
    expect(getGodDefinition(key)?.alignment).toBe("bad");
  });

  it("classifies caishen and fushen effects", () => {
    expect(isCaishenGodKey("daCaishen")).toBe(true);
    expect(isCaishenGodKey("xiaoCaishen")).toBe(true);
    expect(isCaishenGodKey("daFushen")).toBe(false);
    expect(isFushenGodKey("daFushen")).toBe(true);
    expect(isFushenGodKey("xiaoFushen")).toBe(true);
    expect(isFushenGodKey("daQiongshen")).toBe(false);
    expect(isShuaishenGodKey("daShuaishen")).toBe(true);
    expect(isShuaishenGodKey("xiaoShuaishen")).toBe(true);
    expect(isShuaishenGodKey("xiaoFushen")).toBe(false);
  });

  it("returns immediate attach reward counts for fushen gods", () => {
    expect(getGodAttachRewardCount("daFushen")).toBe(2);
    expect(getGodAttachRewardCount("xiaoFushen")).toBe(1);
    expect(getGodAttachRewardCount("daCaishen")).toBe(0);
  });

  it("only lets da fushen auto-build on empty land purchase", () => {
    expect(getPurchaseHouseBonusByGod("daFushen")).toBe(1);
    expect(getPurchaseHouseBonusByGod("xiaoFushen")).toBe(0);
    expect(getPurchaseHouseBonusByGod("daCaishen")).toBe(0);
  });

  it("keeps attached god duration at five days", () => {
    expect(GOD_DURATION_TURNS).toBe(5);
  });
});
