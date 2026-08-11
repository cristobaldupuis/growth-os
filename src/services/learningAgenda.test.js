import { test } from "node:test";
import assert from "node:assert/strict";
import { mkAgendaItem, agendaRollup, seedInitiativeFromAgenda } from "./learningAgenda.js";

test("mkAgendaItem: defaults to Open status and the given brand", () => {
  const a = mkAgendaItem("brandA", ["Retention"]);
  assert.equal(a.status, "Open");
  assert.equal(a.brandId, "brandA");
  assert.equal(a.category, "Retention");
});

test("mkAgendaItem: 'all' brand resolves to default", () => {
  const a = mkAgendaItem("all", []);
  assert.equal(a.brandId, "default");
});

test("agendaRollup: counts linked initiatives by status", () => {
  const agenda = [{ id:"la-1", question:"Does X beat Y?" }];
  const items = [
    { id:"e-1", agendaId:"la-1", status:"Running" },
    { id:"e-2", agendaId:"la-1", status:"Draft" },
    { id:"e-3", agendaId:"la-1", status:"Completed", results:{ keyLearning:"X won." }, endDate:"2026-06-01" },
    { id:"e-4", agendaId:"la-2", status:"Running" }, // different agenda, must not roll in
  ];
  const [r] = agendaRollup(agenda, items);
  assert.equal(r.linkedCount, 3);
  assert.equal(r.runningCount, 1);
  assert.equal(r.draftCount, 1);
  assert.equal(r.closedCount, 1);
  assert.equal(r.hasAnswer, true);
  assert.equal(r.latestLearning, "X won.");
});

test("agendaRollup: no linked initiatives yields zeroed rollup and no answer", () => {
  const [r] = agendaRollup([{ id:"la-1" }], []);
  assert.equal(r.linkedCount, 0);
  assert.equal(r.hasAnswer, false);
  assert.equal(r.latestLearning, null);
});

test("seedInitiativeFromAgenda: carries the question forward as title and hypothesis", () => {
  const a = {
    id:"la-1", question:"Does creator authority beat product demo for cold traffic?",
    holdConstant:"budget and placement", varies:"creator vs. product-first creative",
    falsifyingResult:"No CVR lift after 3 weeks at 1000+ sessions", category:"Acquisition", brandId:"b1",
    sampleGuidance:"3 weeks, 1000 sessions/arm",
  };
  const seed = seedInitiativeFromAgenda(a);
  assert.equal(seed.title, a.question);
  assert.equal(seed.agendaId, "la-1");
  assert.equal(seed.killCriteria, a.falsifyingResult);
  assert.equal(seed.category, "Acquisition");
  assert.equal(seed.brandId, "b1");
  assert.match(seed.hypothesis, /creator vs\. product-first creative/);
  assert.match(seed.hypothesis, /holding budget and placement constant/);
});

test("seedInitiativeFromAgenda: empty agenda item produces empty seed fields", () => {
  const seed = seedInitiativeFromAgenda({ id:"la-2" });
  assert.equal(seed.title, "");
  assert.equal(seed.hypothesis, "");
  assert.equal(seed.killCriteria, "");
});

test("seedInitiativeFromAgenda: null input returns empty object", () => {
  assert.deepEqual(seedInitiativeFromAgenda(null), {});
});
