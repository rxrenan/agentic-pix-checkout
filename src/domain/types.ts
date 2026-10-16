export const PAYMENT_STATUSES = [
  "created",
  "awaiting_user_approval",
  "approved",
  "rejected",
  "expired",
  "settled",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  created: "criado",
  awaiting_user_approval: "aguardando aprovação do usuário",
  approved: "aprovado",
  rejected: "recusado",
  expired: "expirado",
  settled: "liquidado",
};

export type CatalogItem = {
  sku: string;
  name: string;
  description: string;
  unit_price_cents: number;
  available: boolean;
};

export type Catalog = {
  store: {
    id: string;
    name: string;
    address: string;
    pix: {
      key_type: string;
      key: string;
      holder_name: string;
    };
  };
  currency: "BRL";
  policies: {
    fulfillment: string;
    shipping_cents: number;
    returns: string;
  };
  items: CatalogItem[];
};

export type HabitualOrder = {
  customer_id: string;
  label: string;
  items: Array<{ sku: string; qty: number }>;
};

export type Customer = {
  customer_id: string;
  display_name: string;
  note: string;
};

export type CartLine = {
  sku: string;
  name: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

export type Cart = {
  cart_id: string;
  customer_id: string;
  items: CartLine[];
  total_cents: number;
  currency: "BRL";
  fulfillment: string;
};

export type PaymentIntent = {
  intent_id: string;
  consent_id: string;
  idempotency_key: string;
  customer_id: string;
  status: PaymentStatus;
  amount_cents: number;
  currency: "BRL";
  items: CartLine[];
  summary: string;
  receiver_name: string;
  pix_key: string;
  pix_key_type: string;
  approval_id: string | null;
  approved_at: string | null;
  settled_at: string | null;
  end_to_end_id: string | null;
  created_at: string;
  expires_at: string;
  rejected_at: string | null;
  expired_at: string | null;
};

export type AuditEventName =
  | "payment_intent_created"
  | "consent_awaiting_user"
  | "user_biometric_approved"
  | "user_approval_rejected"
  | "confirmation_mismatch"
  | "consent_expired"
  | "settle_blocked"
  | "payment_settled";

export type AuditEvent = {
  ts: string;
  event: AuditEventName;
  intent_id: string;
  consent_id: string;
  approval_id: string | null;
  actor: "agent" | "user" | "itp" | "system";
  status: PaymentStatus;
  amount_cents: number;
  currency: "BRL";
  end_to_end_id?: string;
  detail?: string;
};

export type PersistedState = {
  carts: Record<string, Cart>;
  intents: Record<string, PaymentIntent>;
  idempotency: Record<string, string>;
};
