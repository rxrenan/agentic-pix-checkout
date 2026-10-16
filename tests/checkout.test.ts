import assert from "node:assert/strict";
import { test } from "node:test";

import { CONFIRMATION_PHRASE, DEMO_CUSTOMER_ID } from "../src/app.js";
import { AppError } from "../src/errors.js";
import { tempApp } from "./helpers.js";

const ITEMS = [
  { sku: "cafe-coado-200", qty: 1 },
  { sku: "pao-na-chapa", qty: 1 },
];

function open(app: ReturnType<typeof tempApp>["app"], key = "checkout-test-001") {
  app.callTool("upsert_cart", { customer_id: DEMO_CUSTOMER_ID, items: ITEMS });
  const raw = app.callTool("start_checkout", {
    customer_id: DEMO_CUSTOMER_ID,
    idempotency_key: key,
  });
  assert.equal(raw.isError, false);
  return JSON.parse(raw.content[0]!.text) as {
    intent_id: string;
    consent_id: string;
    status: string;
    amount_cents: number;
    approval_id: string | null;
    end_to_end_id: string | null;
    idempotent_replay?: boolean;
  };
}

test("checkout para em awaiting_user_approval e o log passa por created", () => {
  const { app } = tempApp();
  const intent = open(app);
  assert.equal(intent.status, "awaiting_user_approval");
  assert.equal(intent.amount_cents, 1450);
  assert.equal(intent.approval_id, null);
  assert.equal(intent.end_to_end_id, null);

  const events = app.readAudit().map((event) => event.event);
  assert.deepEqual(events, ["payment_intent_created", "consent_awaiting_user"]);
  assert.equal(app.readAudit()[0]?.status, "created");
  assert.equal(app.readAudit()[0]?.actor, "agent");
  assert.equal(app.readAudit()[0]?.approval_id, null);
});

test("liquidar antes da aprovação falha e não muda o status", () => {
  const { app } = tempApp();
  const intent = open(app);
  assert.throws(() => app.settle(intent.intent_id), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, "approval_required");
    assert.equal(error.httpStatus, 409);
    return true;
  });
  assert.equal(app.getPayment(intent.intent_id).status, "awaiting_user_approval");
  const blocked = app.readAudit().filter((event) => event.event === "settle_blocked");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.approval_id, null);
});

test("aprovação gera approval_id e a liquidação aponta para ele", () => {
  const { app } = tempApp();
  const intent = open(app);
  const approved = app.approve(intent.consent_id, {
    customerId: DEMO_CUSTOMER_ID,
    method: "simulated_biometric",
    confirmationPhrase: CONFIRMATION_PHRASE,
  });
  assert.equal(approved.status, "approved");
  assert.ok(approved.approval_id);

  const settled = app.settle(intent.intent_id);
  assert.equal(settled.status, "settled");
  assert.equal(settled.approval_id, approved.approval_id);
  assert.equal(settled.end_to_end_id?.length, 32);

  const again = app.settle(intent.intent_id);
  assert.equal(again.idempotent_replay, true);
  assert.equal(again.end_to_end_id, settled.end_to_end_id);

  const settledEvents = app.readAudit().filter((event) => event.event === "payment_settled");
  const approvals = app.readAudit().filter((event) => event.event === "user_biometric_approved");
  assert.equal(settledEvents.length, 1);
  assert.equal(approvals.length, 1);
  assert.equal(settledEvents[0]?.approval_id, approvals[0]?.approval_id);
  assert.equal(settledEvents[0]?.actor, "itp");
  assert.equal(approvals[0]?.actor, "user");
});

test("frase errada e método do agente não aprovam", () => {
  const { app } = tempApp();
  const intent = open(app);
  assert.throws(
    () =>
      app.approve(intent.consent_id, {
        customerId: DEMO_CUSTOMER_ID,
        method: "simulated_biometric",
        confirmationPhrase: "pode pagar",
      }),
    (error: unknown) => error instanceof AppError && error.code === "confirmation_mismatch",
  );
  assert.throws(
    () =>
      app.approve(intent.consent_id, {
        customerId: DEMO_CUSTOMER_ID,
        method: "agent",
        confirmationPhrase: CONFIRMATION_PHRASE,
      }),
    (error: unknown) => error instanceof AppError && error.code === "biometric_required",
  );
  assert.equal(app.getConsent(intent.consent_id).status, "awaiting_user_approval");
  assert.equal(app.readAudit().some((event) => event.event === "payment_settled"), false);
});

test("recusa encerra sem end_to_end_id", () => {
  const { app } = tempApp();
  const intent = open(app);
  const rejected = app.reject(intent.consent_id, { customerId: DEMO_CUSTOMER_ID });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.end_to_end_id, null);
  assert.equal(rejected.approval_id, null);
  assert.throws(() => app.settle(intent.intent_id), /aprovação/);
  assert.throws(() => app.approve(intent.consent_id, {
    customerId: DEMO_CUSTOMER_ID,
    method: "simulated_biometric",
    confirmationPhrase: CONFIRMATION_PHRASE,
  }), /recusar|aprovar|rejected/);
});

test("consentimento expirado não aceita aprovação tardia", () => {
  let clock = new Date("2026-10-16T12:00:00.000Z");
  const { app } = tempApp({ now: () => clock, consentTtlMs: 1_000 });
  const intent = open(app, "checkout-expira-001");
  clock = new Date(clock.getTime() + 5_000);
  const expired = app.getPayment(intent.intent_id);
  assert.equal(expired.status, "expired");
  assert.throws(
    () =>
      app.approve(intent.consent_id, {
        customerId: DEMO_CUSTOMER_ID,
        method: "simulated_biometric",
        confirmationPhrase: CONFIRMATION_PHRASE,
      }),
    (error: unknown) => error instanceof AppError && error.code === "invalid_transition",
  );
  assert.equal(app.getPayment(intent.intent_id).status, "expired");
  assert.equal(app.readAudit().filter((event) => event.event === "consent_expired").length, 1);
  assert.equal(app.readAudit().some((event) => event.event === "payment_settled"), false);
});

test("idempotência devolve o mesmo intent e preço não vem do agente", () => {
  const { app } = tempApp();
  const first = open(app, "mesma-chave-0001");
  const replaced = app.callTool("upsert_cart", {
    customer_id: DEMO_CUSTOMER_ID,
    items: [{ sku: "espresso", qty: 2 }],
  });
  assert.equal(replaced.isError, false);
  const replay = app.callTool("start_checkout", {
    customer_id: DEMO_CUSTOMER_ID,
    idempotency_key: "mesma-chave-0001",
  });
  assert.equal(replay.isError, false);
  const second = JSON.parse(replay.content[0]!.text) as typeof first;
  assert.equal(second.intent_id, first.intent_id);
  assert.equal(second.idempotent_replay, true);
  assert.equal(second.amount_cents, 1450);

  const priced = app.callTool("upsert_cart", {
    customer_id: DEMO_CUSTOMER_ID,
    items: [{ sku: "espresso", qty: 1, unit_price_cents: 1 }],
  });
  assert.equal(priced.isError, true);
  assert.match(priced.content[0]!.text, /price_not_allowed/);

  const missing = app.callTool("upsert_cart", {
    customer_id: DEMO_CUSTOMER_ID,
    items: [{ sku: "nao-existe", qty: 1 }],
  });
  assert.match(missing.content[0]!.text, /unknown_sku/);

  const unavailable = app.callTool("upsert_cart", {
    customer_id: DEMO_CUSTOMER_ID,
    items: [{ sku: "bolo-festa", qty: 1 }],
  });
  assert.match(unavailable.content[0]!.text, /unavailable_sku/);
});

test("o agente não tem ferramenta de aprovar ou liquidar", () => {
  const { app } = tempApp();
  const names = app.listTools().map((tool) => tool.name);
  assert.deepEqual(names, [
    "list_catalog",
    "get_habitual_order",
    "upsert_cart",
    "get_cart",
    "start_checkout",
    "get_payment_status",
  ]);
  const denied = app.callTool("approve_payment", { confirmation_phrase: CONFIRMATION_PHRASE });
  assert.equal(denied.isError, true);
  assert.match(denied.content[0]!.text, /unknown_tool/);
});
