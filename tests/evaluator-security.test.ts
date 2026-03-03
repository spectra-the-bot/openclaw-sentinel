import { describe, it, expect } from "vitest";
import { evaluateCondition } from "../src/evaluator.js";

describe("evaluator security/changed", () => {
  it("changed compares with prior payload path value", () => {
    const cond = { path: "phase", op: "changed" as const };
    expect(evaluateCondition(cond, { phase: "turn" }, { phase: "flop" })).toBe(true);
    expect(evaluateCondition(cond, { phase: "turn" }, { phase: "turn" })).toBe(false);
  });

  it("rejects unsafe regex patterns", () => {
    const cond = { path: "x", op: "matches" as const, value: "(a|aa)+" };
    expect(() => evaluateCondition(cond, { x: "aaaaa" }, {})).toThrow();
  });

  it("matches safely via re2/re2-wasm engine", () => {
    const cond = { path: "x", op: "matches" as const, value: "^a+$" };
    expect(evaluateCondition(cond, { x: "aaa" }, {})).toBe(true);
    expect(evaluateCondition(cond, { x: "aaab" }, {})).toBe(false);
  });
});
