import { z } from "zod";

// Identifiers are validated with z.guid(), not z.uuid(). Zod 4 makes z.uuid()
// check the RFC 4122 version and variant nibbles, but the Postgres uuid type
// stores any 128-bit value and enforces neither - the seeded ids in 0001, such
// as 22222222-0000-0000-0000-000000000001, are real rows that z.uuid() rejects.
// Validating a format the column does not guarantee makes the app refuse its
// own data, so the check is the shape only.

// One definition of the inventory rules, parsed by both the forms and the
// Server Actions so they cannot drift.
//
// Several of these deliberately mirror constraints that already exist in the
// database. The database is the real control - it cannot be bypassed - and
// these exist so the user reads a sentence instead of a raised exception.

// numeric(12,2) in the schema. Two decimals, never negative.
const MONEY_MAX = 9999999999.99;
const NAME_MAX = 120;
const SKU_MAX = 40;
const REASON_MAX = 200;

const money = (fieldLabel: string) =>
  z.coerce
    .number({ error: `${fieldLabel} must be a number.` })
    .min(0, { error: `${fieldLabel} cannot be negative.` })
    .max(MONEY_MAX, { error: `${fieldLabel} is too large.` });

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a product name." })
    .max(NAME_MAX, { error: `Name must be ${NAME_MAX} characters or fewer.` }),
  // Unique per organisation, not globally: uq_sku_per_org. Two shops may both
  // use STA-001.
  sku: z
    .string()
    .trim()
    .min(1, { error: "Enter a SKU." })
    .max(SKU_MAX, { error: `SKU must be ${SKU_MAX} characters or fewer.` }),
  // Empty string means "no category". The column is nullable.
  categoryId: z.union([z.literal(""), z.guid({ error: "Choose a valid category." })]),
  unitPrice: money("Selling price"),
  costPrice: money("Cost price"),
  reorderLevel: z.coerce
    .number({ error: "Reorder level must be a number." })
    .int({ error: "Reorder level must be a whole number." })
    .min(0, { error: "Reorder level cannot be negative." }),
});

// FR-3.4. A receipt is always a positive quantity; the reason explains where
// the goods came from.
export const receiveStockSchema = z.object({
  productId: z.guid({ error: "Something went wrong. Reload the page and try again." }),
  quantity: z.coerce
    .number({ error: "Quantity must be a number." })
    .int({ error: "Quantity must be a whole number." })
    .positive({ error: "Enter a quantity greater than zero." }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Say where this stock came from." })
    .max(REASON_MAX),
});

// FR-3.5. Signed, because an adjustment can go either way, but never zero -
// chk_movement_quantity rejects that. The reason is mandatory here and in the
// database since migration 0010.
export const adjustStockSchema = z.object({
  productId: z.guid({ error: "Something went wrong. Reload the page and try again." }),
  quantity: z.coerce
    .number({ error: "Quantity must be a number." })
    .int({ error: "Quantity must be a whole number." })
    .refine((value) => value !== 0, {
      error: "An adjustment of zero changes nothing. Use a positive or negative number.",
    }),
  reason: z
    .string()
    .trim()
    .min(1, { error: "Say why the stock is being adjusted." })
    .max(REASON_MAX),
});

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a category name." })
    .max(NAME_MAX, { error: `Name must be ${NAME_MAX} characters or fewer.` }),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
