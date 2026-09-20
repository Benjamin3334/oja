import { z } from "zod";

import { PAYMENT_METHODS } from "@/lib/payment-methods";

// Identifiers are validated with z.guid(), not z.uuid(). Zod 4 makes z.uuid()
// check the RFC 4122 version and variant nibbles, but the Postgres uuid type
// stores any 128-bit value and enforces neither - the seeded ids in 0001, such
// as 22222222-0000-0000-0000-000000000001, are real rows that z.uuid() rejects.
// Validating a format the column does not guarantee makes the app refuse its
// own data, so the check is the shape only.

// sale_status is deliberately absent. Since 0009 and 0011 the client cannot
// write it at all - it is set by create_draft_sale, complete_sale and
// void_sale - so a schema for it would describe a field that does not exist.
export const startSaleSchema = z.object({
  // Empty string means a walk-in. customers.id is nullable on sales for
  // exactly this case (FR-4.2).
  customerId: z.union([z.literal(""), z.guid({ error: "Choose a valid customer." })]),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: "Choose how the customer is paying.",
  }),
  note: z.string().trim().max(500).optional(),
});

export const saleLineSchema = z.object({
  saleId: z.guid({ error: "Something went wrong. Reload the page and try again." }),
  productId: z.guid({ error: "Choose a product." }),
  quantity: z.coerce
    .number({ error: "Quantity must be a number." })
    .int({ error: "Quantity must be a whole number." })
    .positive({ error: "Enter a quantity greater than zero." }),
});

// FR-4.7. A void is permanent and restores stock, so the reason is not
// optional: it is the only record of why the sale was reversed.
export const voidSaleSchema = z.object({
  saleId: z.guid({ error: "Something went wrong. Reload the page and try again." }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Say why this sale is being voided." })
    .max(200),
});

export type StartSaleInput = z.infer<typeof startSaleSchema>;
export type SaleLineInput = z.infer<typeof saleLineSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
