import fs from "node:fs";
import path from "node:path";

import { AppError } from "./errors.js";
import { endToEndId, nid } from "./domain/ids.js";
import { formatBrl } from "./domain/money.js";
import { can, transition } from "./domain/states.js";
import type {
  AuditEvent,
  Cart,
  CartLine,
  Catalog,
  Customer,
  HabitualOrder,
  PaymentIntent,
  PaymentStatus,
  PersistedState,
} from "./domain/types.js";
import { STATUS_LABEL } from "./domain/types.js";

export const CONFIRMATION_PHRASE = "CONFIRMO O PIX";
export const DEMO_CUSTOMER_ID = "cust_demo_001";
export const DEFAULT_TTL_MS = 3 * 60 * 1000;

const MAX_QTY = 20;

type ToolContent = {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type PublicIntent = {
  intent_id: string;
  consent_id: string;
  idempotency_key: string;
  customer_id: string;
  status: PaymentStatus;
  status_label: string;
  amount_cents: number;
  amount_display: string;
  currency: "BRL";
  items: CartLine[];
  summary: string;
  receiver_name: string;
  pix_key: string;
  pix_key_type: string;
  approval_id: string | null;
  end_to_end_id: string | null;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  settled_at: string | null;
  idempotent_replay?: boolean;
  next_step: string;
};

export type App = {
  listTools(): ToolDefinition[];
  callTool(name: string, args: unknown): ToolContent;
  approve(consentId: string, input: { customerId: string; confirmationPhrase: string; method: string }): PublicIntent;
  reject(consentId: string, input: { customerId: string }): PublicIntent;
  settle(intentId: string): PublicIntent;
  getConsent(consentId: string): PublicIntent;
  getPayment(intentId: string): PublicIntent;
  readAudit(): AuditEvent[];
  auditPath: string;
};

type Options = {
  dataDir: string;
  fixturesDir: string;
  now?: () => Date;
  consentTtlMs?: number;
};

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("invalid_arguments", `${label} precisa ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function textResult(payload: unknown, isError = false): ToolContent {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  };
}

function emptyState(): PersistedState {
  return { carts: {}, intents: {}, idempotency: {} };
}

export function createApp(options: Options): App {
  const now = options.now ?? (() => new Date());
  const ttlMs = options.consentTtlMs ?? DEFAULT_TTL_MS;
  fs.mkdirSync(options.dataDir, { recursive: true });

  const catalog = readJson<Catalog>(path.join(options.fixturesDir, "catalog.json"));
  const habitual = readJson<HabitualOrder>(path.join(options.fixturesDir, "habitual-order.json"));
  const customer = readJson<Customer>(path.join(options.fixturesDir, "customer.json"));

  if (catalog.currency !== "BRL") {
    throw new AppError("invalid_catalog", "O catálogo de demo só aceita BRL.");
  }
  if (customer.customer_id !== DEMO_CUSTOMER_ID || habitual.customer_id !== DEMO_CUSTOMER_ID) {
    throw new AppError("invalid_fixtures", "Os fixtures precisam usar cust_demo_001.");
  }

  const statePath = path.join(options.dataDir, "state.json");
  const auditPath = path.join(options.dataDir, "audit.jsonl");

  const load = (): PersistedState => {
    if (!fs.existsSync(statePath)) return emptyState();
    return readJson<PersistedState>(statePath);
  };

  const save = (state: PersistedState) => {
    const tmp = `${statePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, statePath);
  };

  const append = (event: AuditEvent) => {
    fs.appendFileSync(auditPath, `${JSON.stringify(event)}\n`);
  };

  const requireCustomer = (customerId: string) => {
    if (customerId !== customer.customer_id) {
      throw new AppError("unknown_customer", "Cliente desconhecido. Este demo só tem cust_demo_001.", 404);
    }
  };

  const findItem = (sku: string) => catalog.items.find((item) => item.sku === sku);

  const lineFrom = (sku: string, qty: number): CartLine => {
    const item = findItem(sku);
    if (!item) {
      throw new AppError("unknown_sku", `SKU fora do catálogo: ${sku}.`);
    }
    if (!item.available) {
      throw new AppError("unavailable_sku", `${item.name} está indisponível.`);
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      throw new AppError("invalid_qty", `Quantidade de ${sku} precisa ser um inteiro de 1 a ${MAX_QTY}.`);
    }
    return {
      sku: item.sku,
      name: item.name,
      qty,
      unit_price_cents: item.unit_price_cents,
      line_total_cents: item.unit_price_cents * qty,
    };
  };

  const summaryOf = (items: CartLine[]) => items.map((item) => `${item.qty}x ${item.name}`).join(", ");

  const publicIntent = (intent: PaymentIntent, extra?: { idempotent_replay?: boolean }): PublicIntent => {
    let nextStep = "Consulte get_payment_status.";
    if (intent.status === "awaiting_user_approval") {
      nextStep =
        "O usuário aprova no ITP simulado. Aprovação e liquidação ficam fora das ferramentas do agente.";
    } else if (intent.status === "settled") {
      nextStep = "Pagamento simulado liquidado. O comprovante está no audit log, ligado ao approval_id.";
    } else if (intent.status === "rejected") {
      nextStep = "O usuário recusou. Não há Pix.";
    } else if (intent.status === "expired") {
      nextStep = "O consentimento expirou. Não há Pix. Um novo checkout precisa de outra chave de idempotência.";
    } else if (intent.status === "approved") {
      nextStep = "Aprovado pelo usuário. A liquidação simulada ainda não rodou.";
    }
    return {
      intent_id: intent.intent_id,
      consent_id: intent.consent_id,
      idempotency_key: intent.idempotency_key,
      customer_id: intent.customer_id,
      status: intent.status,
      status_label: STATUS_LABEL[intent.status],
      amount_cents: intent.amount_cents,
      amount_display: formatBrl(intent.amount_cents),
      currency: intent.currency,
      items: intent.items,
      summary: intent.summary,
      receiver_name: intent.receiver_name,
      pix_key: intent.pix_key,
      pix_key_type: intent.pix_key_type,
      approval_id: intent.approval_id,
      end_to_end_id: intent.end_to_end_id,
      created_at: intent.created_at,
      expires_at: intent.expires_at,
      approved_at: intent.approved_at,
      settled_at: intent.settled_at,
      idempotent_replay: extra?.idempotent_replay,
      next_step: nextStep,
    };
  };

  const auditFrom = (
    intent: PaymentIntent,
    event: AuditEvent["event"],
    actor: AuditEvent["actor"],
    detail?: string,
  ) => {
    const row: AuditEvent = {
      ts: now().toISOString(),
      event,
      intent_id: intent.intent_id,
      consent_id: intent.consent_id,
      approval_id: intent.approval_id,
      actor,
      status: intent.status,
      amount_cents: intent.amount_cents,
      currency: "BRL",
    };
    if (intent.end_to_end_id) row.end_to_end_id = intent.end_to_end_id;
    if (detail) row.detail = detail;
    append(row);
  };

  const expireIfNeeded = (state: PersistedState, intent: PaymentIntent): PaymentIntent => {
    if (intent.status !== "awaiting_user_approval") return intent;
    if (now().getTime() < Date.parse(intent.expires_at)) return intent;
    if (!can(intent.status, "expire")) return intent;
    intent.status = transition(intent.status, "expire");
    intent.expired_at = now().toISOString();
    state.intents[intent.intent_id] = intent;
    save(state);
    auditFrom(intent, "consent_expired", "system", "Prazo do consentimento acabou antes da aprovação.");
    return intent;
  };

  const intentByConsent = (consentId: string): { state: PersistedState; intent: PaymentIntent } => {
    const state = load();
    const found = Object.values(state.intents).find((item) => item.consent_id === consentId);
    if (!found) {
      throw new AppError("unknown_consent", "Consentimento não encontrado.", 404);
    }
    return { state, intent: expireIfNeeded(state, found) };
  };

  const intentById = (intentId: string): { state: PersistedState; intent: PaymentIntent } => {
    const state = load();
    const found = state.intents[intentId];
    if (!found) {
      throw new AppError("unknown_intent", "Intent de pagamento não encontrado.", 404);
    }
    return { state, intent: expireIfNeeded(state, found) };
  };

  const listCatalog = () => ({
    store: catalog.store,
    currency: catalog.currency,
    policies: catalog.policies,
    items: catalog.items.map((item) => ({
      ...item,
      unit_price_display: formatBrl(item.unit_price_cents),
    })),
    note: "Preço vem daqui. O agente não informa preço na ferramenta de carrinho.",
  });

  const getHabitual = (args: unknown) => {
    const body = asObject(args, "argumentos");
    const customerId = typeof body.customer_id === "string" ? body.customer_id : customer.customer_id;
    requireCustomer(customerId);
    const items = habitual.items.map((item) => lineFrom(item.sku, item.qty));
    const total = items.reduce((sum, item) => sum + item.line_total_cents, 0);
    return {
      customer_id: customer.customer_id,
      display_name: customer.display_name,
      label: habitual.label,
      items,
      total_cents: total,
      total_display: formatBrl(total),
      currency: "BRL" as const,
    };
  };

  const upsertCart = (args: unknown) => {
    const body = asObject(args, "argumentos");
    const customerId = typeof body.customer_id === "string" ? body.customer_id : customer.customer_id;
    requireCustomer(customerId);
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new AppError("empty_cart", "O carrinho precisa de ao menos um item.");
    }
    const items = body.items.map((raw) => {
      const line = asObject(raw, "item");
      if (typeof line.sku !== "string") {
        throw new AppError("invalid_arguments", "Cada item precisa de sku.");
      }
      if (line.unit_price_cents !== undefined || line.price !== undefined) {
        throw new AppError(
          "price_not_allowed",
          "Preço não entra pelo agente. O catálogo é a fonte do valor.",
        );
      }
      return lineFrom(line.sku, line.qty as number);
    });
    const state = load();
    const cart: Cart = {
      cart_id: state.carts[customerId]?.cart_id ?? nid("cart"),
      customer_id: customerId,
      items,
      total_cents: items.reduce((sum, item) => sum + item.line_total_cents, 0),
      currency: "BRL",
      fulfillment: catalog.policies.fulfillment,
    };
    state.carts[customerId] = cart;
    save(state);
    return { ...cart, total_display: formatBrl(cart.total_cents) };
  };

  const getCart = (args: unknown) => {
    const body = asObject(args, "argumentos");
    const customerId = typeof body.customer_id === "string" ? body.customer_id : customer.customer_id;
    requireCustomer(customerId);
    const state = load();
    const cart = state.carts[customerId];
    if (!cart) {
      throw new AppError("empty_cart", "Ainda não há carrinho para este cliente.", 404);
    }
    return { ...cart, total_display: formatBrl(cart.total_cents) };
  };

  const startCheckout = (args: unknown): PublicIntent => {
    const body = asObject(args, "argumentos");
    const customerId = typeof body.customer_id === "string" ? body.customer_id : customer.customer_id;
    requireCustomer(customerId);
    const key = body.idempotency_key;
    if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,80}$/.test(key)) {
      throw new AppError(
        "invalid_idempotency_key",
        "idempotency_key é obrigatória, de 8 a 80 caracteres (letras, números, ponto, traço, dois-pontos).",
      );
    }
    const state = load();
    const existingId = state.idempotency[key];
    if (existingId) {
      const existing = state.intents[existingId];
      if (!existing) {
        throw new AppError("broken_idempotency", "A chave aponta para um intent ausente.", 500);
      }
      return publicIntent(expireIfNeeded(state, existing), { idempotent_replay: true });
    }
    const cart = state.carts[customerId];
    if (!cart || cart.items.length === 0) {
      throw new AppError("empty_cart", "Monte o carrinho antes do checkout.");
    }
    const createdAt = now();
    const intent: PaymentIntent = {
      intent_id: nid("pi"),
      consent_id: nid("cns"),
      idempotency_key: key,
      customer_id: customerId,
      status: "created",
      amount_cents: cart.total_cents,
      currency: "BRL",
      items: cart.items.map((item) => ({ ...item })),
      summary: summaryOf(cart.items),
      receiver_name: catalog.store.pix.holder_name,
      pix_key: catalog.store.pix.key,
      pix_key_type: catalog.store.pix.key_type,
      approval_id: null,
      approved_at: null,
      settled_at: null,
      end_to_end_id: null,
      created_at: createdAt.toISOString(),
      expires_at: new Date(createdAt.getTime() + ttlMs).toISOString(),
      rejected_at: null,
      expired_at: null,
    };
    state.intents[intent.intent_id] = intent;
    state.idempotency[key] = intent.intent_id;
    save(state);
    auditFrom(intent, "payment_intent_created", "agent", "Checkout criou o intent. Ainda não há pagamento.");

    intent.status = transition(intent.status, "submit_to_user");
    state.intents[intent.intent_id] = intent;
    save(state);
    auditFrom(intent, "consent_awaiting_user", "itp", "Consentimento aberto. Aguarda aprovação do usuário.");
    return publicIntent(intent);
  };

  const getPaymentStatus = (args: unknown) => {
    const body = asObject(args, "argumentos");
    if (typeof body.intent_id !== "string") {
      throw new AppError("invalid_arguments", "intent_id é obrigatório.");
    }
    const { intent } = intentById(body.intent_id);
    return publicIntent(intent);
  };

  const approve: App["approve"] = (consentId, input) => {
    requireCustomer(input.customerId);
    if (input.method !== "simulated_biometric") {
      throw new AppError(
        "biometric_required",
        "A aprovação deste demo só aceita method simulated_biometric.",
      );
    }
    const { state, intent } = intentByConsent(consentId);
    if (intent.customer_id !== input.customerId) {
      throw new AppError("customer_mismatch", "O customer_id não é o do consentimento.");
    }
    if (intent.status === "approved" || intent.status === "settled") {
      return publicIntent(intent, { idempotent_replay: true });
    }
    if (intent.status !== "awaiting_user_approval") {
      throw new AppError(
        "invalid_transition",
        `Não dá para aprovar um consentimento em ${intent.status}.`,
        409,
      );
    }
    if (input.confirmationPhrase !== CONFIRMATION_PHRASE) {
      auditFrom(intent, "confirmation_mismatch", "user", "Frase de confirmação diferente da esperada. Estado intacto.");
      throw new AppError(
        "confirmation_mismatch",
        "A frase de confirmação não confere. O pagamento continua aguardando.",
      );
    }
    if (!can(intent.status, "approve")) {
      throw new AppError("invalid_transition", "Aprovação recusada pela máquina de estados.", 409);
    }
    intent.status = transition(intent.status, "approve");
    intent.approval_id = nid("appr");
    intent.approved_at = now().toISOString();
    state.intents[intent.intent_id] = intent;
    save(state);
    auditFrom(intent, "user_biometric_approved", "user", "Aprovação biométrica simulada registrada.");
    return publicIntent(intent);
  };

  const reject: App["reject"] = (consentId, input) => {
    requireCustomer(input.customerId);
    const { state, intent } = intentByConsent(consentId);
    if (intent.customer_id !== input.customerId) {
      throw new AppError("customer_mismatch", "O customer_id não é o do consentimento.");
    }
    if (intent.status === "rejected") {
      return publicIntent(intent, { idempotent_replay: true });
    }
    if (intent.status !== "awaiting_user_approval") {
      throw new AppError(
        "invalid_transition",
        `Não dá para recusar um consentimento em ${intent.status}.`,
        409,
      );
    }
    intent.status = transition(intent.status, "reject");
    intent.rejected_at = now().toISOString();
    state.intents[intent.intent_id] = intent;
    save(state);
    auditFrom(intent, "user_approval_rejected", "user", "Usuário recusou. Sem Pix.");
    return publicIntent(intent);
  };

  const settle: App["settle"] = (intentId) => {
    const { state, intent } = intentById(intentId);
    if (intent.status === "settled") {
      return publicIntent(intent, { idempotent_replay: true });
    }
    if (intent.status !== "approved" || !intent.approval_id) {
      auditFrom(
        intent,
        "settle_blocked",
        "itp",
        "Liquidação recusada. Falta aprovação do usuário com approval_id.",
      );
      throw new AppError(
        "approval_required",
        "Pix simulado não liquida sem aprovação do usuário.",
        409,
      );
    }
    intent.status = transition(intent.status, "settle");
    intent.settled_at = now().toISOString();
    intent.end_to_end_id = endToEndId(now());
    state.intents[intent.intent_id] = intent;
    save(state);
    auditFrom(intent, "payment_settled", "itp", "Pix simulado liquidado com a aprovação do usuário.");
    return publicIntent(intent);
  };

  const handlers: Record<string, (args: unknown) => unknown> = {
    list_catalog: () => listCatalog(),
    get_habitual_order: (args) => getHabitual(args),
    upsert_cart: (args) => upsertCart(args),
    get_cart: (args) => getCart(args),
    start_checkout: (args) => startCheckout(args),
    get_payment_status: (args) => getPaymentStatus(args),
  };

  return {
    auditPath,
    listTools() {
      const object = { type: "object", additionalProperties: false };
      return [
        {
          name: "list_catalog",
          description:
            "Lê o catálogo fictício do Café Aurora, com SKU, preço em centavos e disponibilidade. Só leitura.",
          inputSchema: { ...object, properties: {} },
        },
        {
          name: "get_habitual_order",
          description:
            "Lê o pedido habitual do Cliente Demo (o café de sempre). Não cria cobrança. customer_id opcional, padrão cust_demo_001.",
          inputSchema: {
            ...object,
            properties: {
              customer_id: { type: "string" },
            },
          },
        },
        {
          name: "upsert_cart",
          description:
            "Substitui o carrinho com SKUs do catálogo e quantidades. Preço é ignorado de propósito: se vier preço, a chamada falha. Não cobra.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              customer_id: { type: "string" },
              items: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["sku", "qty"],
                  properties: {
                    sku: { type: "string" },
                    qty: { type: "integer", minimum: 1, maximum: MAX_QTY },
                  },
                },
              },
            },
          },
        },
        {
          name: "get_cart",
          description: "Lê o carrinho atual do cliente fictício.",
          inputSchema: {
            ...object,
            properties: { customer_id: { type: "string" } },
          },
        },
        {
          name: "start_checkout",
          description:
            "Cria um intent de Pix simulado e um consentimento em awaiting_user_approval. Não liquida, não aprova e não move dinheiro. Exige idempotency_key.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["idempotency_key"],
            properties: {
              customer_id: { type: "string" },
              idempotency_key: { type: "string", minLength: 8, maxLength: 80 },
            },
          },
        },
        {
          name: "get_payment_status",
          description:
            "Lê o status do intent: created, awaiting_user_approval, approved, rejected, expired ou settled.",
          inputSchema: {
            type: "object",
            additionalProperties: false,
            required: ["intent_id"],
            properties: { intent_id: { type: "string" } },
          },
        },
      ];
    },
    callTool(name, args) {
      const handler = handlers[name];
      if (!handler) {
        return textResult(
          {
            error: {
              code: "unknown_tool",
              message: `Ferramenta desconhecida: ${name}. Este servidor não aprova nem liquida Pix.`,
            },
          },
          true,
        );
      }
      try {
        return textResult(handler(args));
      } catch (error) {
        if (error instanceof AppError) {
          return textResult({ error: { code: error.code, message: error.message } }, true);
        }
        throw error;
      }
    },
    approve,
    reject,
    settle,
    getConsent(consentId) {
      return publicIntent(intentByConsent(consentId).intent);
    },
    getPayment(intentId) {
      return publicIntent(intentById(intentId).intent);
    },
    readAudit() {
      if (!fs.existsSync(auditPath)) return [];
      return fs
        .readFileSync(auditPath, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as AuditEvent);
    },
  };
}
