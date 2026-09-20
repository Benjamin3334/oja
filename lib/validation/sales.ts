import { z } from "zod";

// Mirrors the payment_method enum in 0001. An enum models a closed domain, so
// the list here is not a convenience copy: if the database ever gains a value
// and this does not, the form silently stops offering it, which is the failure
// mode worth knowing about.
export const PAYMENT_METHODS = ["cash", "transfer", "card", "credit"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// sale_status is deliberately absent. Since 0009 and 0011 the client cannot
// write it at all - it is set by create_draft_sale, complete_sale and
// void_sale - so a schema for it would describe a field that does not exist.
export const startSaleSchema = z.object({
  // Empty string means a walk-in. customers.id is nullable on sales for
  // exactly this case (FR-4.2).
  customerId: z.union([z.literal(""), z.uuid({ error: "Choose a valid customer." })]),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: "Choose how the customer is paying.",
  }),
  note: z.string().trim().max(500).optional(),
});

export const saleLineSchema = z.object({
  saleId: z.uuid(),
  productId: z.uuid(),
  quantity: z.coerce
    .number({ error: "Quantity must be a number." })
    .int({ error: "Quantity must be a whole number." })
    .positive({ error: "Enter a quantity greater than zero." }),
});

// FR-4.7. A void is permanent and restores stock, so the reason is not
// optional: it is the only record of why the sale was reversed.
export const voidSaleSchema = z.object({
  saleId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Say why this sale is being voided." })
    .max(200),
});

export type StartSaleInput = z.infer<typeof startSaleSchema>;
export type SaleLineInput = z.infer<typeof saleLineSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
