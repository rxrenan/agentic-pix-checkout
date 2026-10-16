import assert from "node:assert/strict";
import { test } from "node:test";

import { CONFIRMATION_PHRASE, DEMO_CUSTOMER_ID } from "../src/app.js";
import { startApprovalServer } from "../src/itp/http.js";
import { tempApp } from "./helpers.js";

test("o app do banco simulado liquida num passo e recusa a frase errada", async () => {
  const { app } = tempApp();
  const server = await startApprovalServer(app, 0);
  try {
    app.callTool("upsert_cart", {
      customer_id: DEMO_CUSTOMER_ID,
      items: [
        { sku: "cafe-coado-200", qty: 1 },
        { sku: "pao-na-chapa", qty: 1 },
      ],
    });
    const opened = JSON.parse(
      app.callTool("start_checkout", {
        customer_id: DEMO_CUSTOMER_ID,
        idempotency_key: "itp-http-0001",
      }).content[0]!.text,
    ) as { intent_id: string; consent_id: string };

    const health = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(health.status, 200);

    const wrong = await fetch(`http://127.0.0.1:${server.port}/consents/${opened.consent_id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        method: "simulated_biometric",
        confirmation_phrase: "sim",
        customer_id: DEMO_CUSTOMER_ID,
      }),
    });
    assert.equal(wrong.status, 400);
    assert.equal(app.getPayment(opened.intent_id).status, "awaiting_user_approval");

    const blocked = await fetch(`http://127.0.0.1:${server.port}/payments/${opened.intent_id}/settle`, {
      method: "POST",
    });
    assert.equal(blocked.status, 409);

    const ok = await fetch(`http://127.0.0.1:${server.port}/consents/${opened.consent_id}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision: "approve",
        method: "simulated_biometric",
        confirmation_phrase: CONFIRMATION_PHRASE,
        customer_id: DEMO_CUSTOMER_ID,
      }),
    });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { status: string; approval_id: string; end_to_end_id: string };
    assert.equal(body.status, "settled");
    assert.ok(body.approval_id);
    assert.equal(body.end_to_end_id.length, 32);
  } finally {
    await server.close();
  }
});
