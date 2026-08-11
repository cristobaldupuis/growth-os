import { test } from "node:test";
import assert from "node:assert/strict";
import { killGateBlocked, killLineProgress } from "./killGate.js";

test("killGateBlocked: blocks Draft -> Running with no kill criteria", () => {
  assert.equal(killGateBlocked("Running", "Draft", ""), true);
  assert.equal(killGateBlocked("Running", "Draft", "   "), true);
});

test("killGateBlocked: passes Draft -> Running with kill criteria set", () => {
  assert.equal(killGateBlocked("Running", "Draft", "Kill if CAC > $55"), false);
});

test("killGateBlocked: does not fire on transitions other than into Running", () => {
  assert.equal(killGateBlocked("Draft", "Draft", ""), false);
  assert.equal(killGateBlocked("Completed", "Running", ""), false);
});

test("killGateBlocked: does not re-block an initiative already Running", () => {
  // A legacy Running item that predates the field being required — editing it
  // (status stays Running) must not become unsaveable.
  assert.equal(killGateBlocked("Running", "Running", ""), false);
});

test("killLineProgress: null with no dates", () => {
  assert.equal(killLineProgress({}), null);
  assert.equal(killLineProgress({ startDate: "2026-01-01" }), null);
});

test("killLineProgress: midpoint of a window reads ~50%", () => {
  const item = { startDate: "2026-01-01", endDate: "2026-01-11" };
  const now = new Date("2026-01-06T12:00:00");
  const r = killLineProgress(item, now);
  assert.ok(Math.abs(r.progress - 0.5) < 0.01);
  assert.equal(r.overdue, false);
});

test("killLineProgress: past the end date is overdue and clamped at 100%", () => {
  const item = { startDate: "2026-01-01", endDate: "2026-01-11" };
  const now = new Date("2026-01-20T12:00:00");
  const r = killLineProgress(item, now);
  assert.equal(r.progress, 1);
  assert.equal(r.overdue, true);
});

test("killLineProgress: null on an invalid window (end before start)", () => {
  const item = { startDate: "2026-01-11", endDate: "2026-01-01" };
  assert.equal(killLineProgress(item), null);
});
