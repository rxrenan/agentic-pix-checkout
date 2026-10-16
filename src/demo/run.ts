import fs from "node:fs";
import path from "node:path";

import { CONFIRMATION_PHRASE, DEMO_CUSTOMER_ID } from "../app.js";
import { formatBrl } from "../domain/money.js";
import { openMcp, parseTool } from "../mcp/session.js";
import { repoRoot } from "../paths.js";

type Line = { sku: string; name: string; qty: number; unit_price_cents: number; line_total_cents: number };

type Habitual = {
  label: string;
  display_name: string;
  items: Line[];
  total_display: string;
};

type CartView = {
  cart_id: string;
  items: Line[];
  total_display: string;
  fulfillment: string;
};

type IntentView = {
  intent_id: string;
  consent_id: string;
  status: string;
  status_label: string;
  amount_display: string;
  summary: string;
  receiver_name: string;
  pix_key: string;
  approval_id: string | null;
  end_to_end_id: string | null;
  expires_at: string;
};

type CatalogView = { items: Array<{ sku: string }> };

type ToolError = { error?: { code?: string; message?: string } };

async function postJson(url: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await response.json()) as unknown;
  return { status: response.status, json };
}

export type DemoResult = {
  transcript: string;
  audit: string;
  payment: IntentView;
  toolNames: string[];
  blockedStatus: number;
};

export async function runDemo(options?: { dataDir?: string }): Promise<DemoResult> {
  const dataDir = options?.dataDir ?? path.join(repoRoot, "examples", "output");
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const lines: string[] = [];
  const say = (text: string) => lines.push(text);

  const session = await openMcp({ DATA_DIR: dataDir, PORT: "0", FIXTURES_DIR: path.join(repoRoot, "examples") });
  try {
    const listed = (await session.request("tools/list")) as { tools: Array<{ name: string }> };
    const toolNames = listed.tools.map((tool) => tool.name);

    say("Café Aurora");
    say("Checkout agêntico com Pix");
    say("Modo demo. Dados fictícios. Nenhum Pix real sai da máquina.");
    say("");
    say("Usuário");
    say("compra o café de sempre");
    say("");
    say("Agente");
    say("Vou ler o pedido habitual e o catálogo antes de montar o carrinho.");
    say("");

    const habitual = parseTool<Habitual>(
      await session.request("tools/call", {
        name: "get_habitual_order",
        arguments: { customer_id: DEMO_CUSTOMER_ID },
      }),
    );
    say("ferramenta get_habitual_order");
    say(`${habitual.display_name}: ${habitual.label}`);
    for (const item of habitual.items) {
      say(`- ${item.qty}x ${item.name}`);
    }
    say("");

    const catalog = parseTool<CatalogView>(
      await session.request("tools/call", { name: "list_catalog", arguments: {} }),
    );
    say("ferramenta list_catalog");
    say(`${catalog.items.length} itens no catálogo, moeda BRL, preço só no servidor.`);
    say("");

    const cart = parseTool<CartView>(
      await session.request("tools/call", {
        name: "upsert_cart",
        arguments: {
          customer_id: DEMO_CUSTOMER_ID,
          items: habitual.items.map((item) => ({ sku: item.sku, qty: item.qty })),
        },
      }),
    );
    if (cart.total_display !== "R$ 14,50") {
      throw new Error(`O café de sempre deveria somar R$ 14,50. Veio ${cart.total_display}.`);
    }
    say("ferramenta upsert_cart");
    say(`Carrinho ${cart.cart_id}`);
    for (const item of cart.items) {
      say(`- ${item.qty}x ${item.name} (${formatBrl(item.unit_price_cents)})`);
    }
    say(`Total ${cart.total_display}`);
    say("Retirada no balcão. Sem frete neste protótipo.");
    say("");
    say("Agente");
    say("Abro o checkout agora. Esta chamada cria o consentimento e para na sua aprovação.");
    say("");

    const opened = parseTool<IntentView>(
      await session.request("tools/call", {
        name: "start_checkout",
        arguments: {
          customer_id: DEMO_CUSTOMER_ID,
          idempotency_key: "demo-cafe-de-sempre-001",
        },
      }),
    );
    say("ferramenta start_checkout");
    say(`intent ${opened.intent_id}`);
    say(`consent ${opened.consent_id}`);
    say(`status ${opened.status} (${opened.status_label})`);
    say(`valor ${opened.amount_display}`);
    say(`resumo ${opened.summary}`);
    say(`expira em ${opened.expires_at}`);
    say("");
    say("Ferramentas visíveis ao agente:");
    say(toolNames.join(", "));
    const forbidden = toolNames.filter((name) => /approv|settle|liquid|pagar|biometric/i.test(name));
    if (forbidden.length > 0) {
      throw new Error(`O agente recebeu ferramenta de pagamento: ${forbidden.join(", ")}`);
    }
    say("Nenhuma delas aprova ou liquida o Pix.");
    say("");

    const blocked = await postJson(`http://127.0.0.1:${session.port}/payments/${opened.intent_id}/settle`, {});
    const blockedBody = blocked.json as ToolError;
    say("ITP simulado");
    say("Tentativa de liquidar antes da aprovação do usuário.");
    say(`HTTP ${blocked.status} ${blockedBody.error?.code ?? ""}`);
    say(blockedBody.error?.message ?? "");
    if (blocked.status !== 409 || blockedBody.error?.code !== "approval_required") {
      throw new Error(`A liquidação sem aprovação deveria falhar. Veio HTTP ${blocked.status}.`);
    }
    say("");

    say("Usuário");
    say(`Confere ${cart.total_display} para Café Aurora e confirma no app do banco simulado.`);
    say(`Frase usada no lugar da biometria: ${CONFIRMATION_PHRASE}`);
    say("");

    const paid = await postJson(`http://127.0.0.1:${session.port}/consents/${opened.consent_id}/decision`, {
      decision: "approve",
      method: "simulated_biometric",
      confirmation_phrase: CONFIRMATION_PHRASE,
      customer_id: DEMO_CUSTOMER_ID,
    });
    if (paid.status !== 200) {
      throw new Error(`Aprovação falhou: HTTP ${paid.status} ${JSON.stringify(paid.json)}`);
    }
    const settled = paid.json as IntentView;
    say("ITP simulado");
    say(`POST /consents/${opened.consent_id}/decision`);
    say(`status ${settled.status} (${settled.status_label})`);
    say(`approval_id ${settled.approval_id}`);
    say(`end_to_end_id ${settled.end_to_end_id}`);
    say(`valor ${settled.amount_display}`);
    say(`recebedor ${settled.receiver_name}`);
    say(`chave Pix fictícia ${settled.pix_key}`);
    say("");

    const status = parseTool<IntentView>(
      await session.request("tools/call", {
        name: "get_payment_status",
        arguments: { intent_id: opened.intent_id },
      }),
    );
    say("Agente");
    say("ferramenta get_payment_status");
    say(`status ${status.status}`);
    if (status.status !== "settled" || !status.approval_id) {
      throw new Error("O status final precisa ser settled e carregar approval_id.");
    }
    say(`O café de sempre está pago no simulador. A autorização do usuário foi ${status.approval_id}.`);
    say("");

    const audit = fs.readFileSync(path.join(dataDir, "audit.jsonl"), "utf8");
    const settledLine = audit
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { event: string; approval_id: string | null })
      .find((event) => event.event === "payment_settled");
    if (!settledLine?.approval_id || settledLine.approval_id !== status.approval_id) {
      throw new Error("O audit log não liga payment_settled ao approval_id da aprovação.");
    }
    say("Auditoria");
    say(path.join(dataDir, "audit.jsonl"));
    say(`payment_settled aponta approval_id ${settledLine.approval_id}`);

    const transcript = `${lines.join("\n")}\n`;
    fs.writeFileSync(path.join(dataDir, "transcript.txt"), transcript);
    fs.writeFileSync(path.join(dataDir, "payment.json"), JSON.stringify(status, null, 2));
    return {
      transcript,
      audit,
      payment: status,
      toolNames,
      blockedStatus: blocked.status,
    };
  } finally {
    await session.close();
  }
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked.endsWith(`${path.sep}run.ts`) || invoked.endsWith(`${path.sep}run.js`)) {
  runDemo()
    .then((result) => {
      process.stdout.write(result.transcript);
    })
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${text}\n`);
      process.exit(1);
    });
}
