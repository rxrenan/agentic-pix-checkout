import type { PaymentStatus } from "./types.js";

export type PaymentEvent = "submit_to_user" | "approve" | "reject" | "expire" | "settle";

const NEXT: Record<PaymentStatus, Partial<Record<PaymentEvent, PaymentStatus>>> = {
  created: { submit_to_user: "awaiting_user_approval" },
  awaiting_user_approval: {
    approve: "approved",
    reject: "rejected",
    expire: "expired",
  },
  approved: { settle: "settled" },
  rejected: {},
  expired: {},
  settled: {},
};

export function transition(from: PaymentStatus, event: PaymentEvent): PaymentStatus {
  const to = NEXT[from][event];
  if (!to) {
    throw new Error(`Transição inválida: ${from} + ${event}`);
  }
  return to;
}

export function can(from: PaymentStatus, event: PaymentEvent): boolean {
  return NEXT[from][event] !== undefined;
}
