import assert from "node:assert/strict";
import { test } from "node:test";

import { can, transition } from "../src/domain/states.js";
import { PAYMENT_STATUSES } from "../src/domain/types.js";
import { endToEndId } from "../src/domain/ids.js";
import { formatBrl } from "../src/domain/money.js";

test("os seis estados do intent existem", () => {
  assert.deepEqual(PAYMENT_STATUSES, [
    "created",
    "awaiting_user_approval",
    "approved",
    "rejected",
    "expired",
    "settled",
  ]);
});

test("transições legais do Pix simulado", () => {
  assert.equal(transition("created", "submit_to_user"), "awaiting_user_approval");
  assert.equal(transition("awaiting_user_approval", "approve"), "approved");
  assert.equal(transition("awaiting_user_approval", "reject"), "rejected");
  assert.equal(transition("awaiting_user_approval", "expire"), "expired");
  assert.equal(transition("approved", "settle"), "settled");
});

test("não há atalho de created ou awaiting para settled", () => {
  assert.equal(can("created", "settle"), false);
  assert.equal(can("awaiting_user_approval", "settle"), false);
  assert.equal(can("rejected", "settle"), false);
  assert.equal(can("expired", "settle"), false);
  assert.equal(can("approved", "approve"), false);
  assert.throws(() => transition("created", "settle"), /Transição inválida/);
  assert.throws(() => transition("awaiting_user_approval", "settle"), /Transição inválida/);
  assert.throws(() => transition("settled", "settle"), /Transição inválida/);
});

test("dinheiro em centavos e endToEndId fictício de 32 caracteres", () => {
  assert.equal(formatBrl(1450), "R$ 14,50");
  assert.equal(formatBrl(800), "R$ 8,00");
  const e2e = endToEndId(new Date("2026-10-16T15:04:00.000Z"));
  assert.equal(e2e.length, 32);
  assert.equal(e2e.startsWith("E00000000"), true);
});
