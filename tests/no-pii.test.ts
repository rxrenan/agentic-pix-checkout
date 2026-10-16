import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { repoRoot } from "../src/paths.js";
import { runDemo } from "../src/demo/run.js";
import { assertNoPersonalData } from "./helpers.js";

test("saída do demo não tem CPF, e-mail, chave ou segredo", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cafe-demo-"));
  const result = await runDemo({ dataDir });

  assert.equal(result.payment.status, "settled");
  assert.equal(result.blockedStatus, 409);
  assert.ok(result.payment.approval_id);
  assert.equal(result.toolNames.includes("start_checkout"), true);
  assert.equal(result.toolNames.some((name) => /settle|approv|biometric/i.test(name)), false);

  const payment = JSON.stringify(result.payment);
  assertNoPersonalData("transcript", result.transcript);
  assertNoPersonalData("audit", result.audit);
  assertNoPersonalData("payment", payment);
  assert.match(result.transcript, /awaiting_user_approval/);
  assert.match(result.transcript, /approval_required/);
  assert.match(result.audit, /"event":"payment_settled"/);
  assert.match(result.audit, new RegExp(`"approval_id":"${result.payment.approval_id}"`));

  const fixtureNames = ["catalog.json", "habitual-order.json", "customer.json"];
  for (const name of fixtureNames) {
    assertNoPersonalData(name, fs.readFileSync(path.join(repoRoot, "examples", name), "utf8"));
  }
});
