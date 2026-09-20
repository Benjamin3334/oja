import { z } from "zod";

// FR-5.1. Name is the only required field: a shop records a customer it can
// name long before it has their address, and demanding more would push staff
// into typing filler.
//
// Phone and email are optional AND nullable in the database, which is not the
// same thing as blank. See the note in lib/actions/customers.ts: an empty
// string would defeat the unique constraint on phone.
const NAME_MAX = 120;
const PHONE_MAX = 30;
const ADDRESS_MAX = 300;

export const customerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, { error: "Enter the customer name." })
    .max(NAME_MAX, { error: `Name must be ${NAME_MAX} characters or fewer.` }),
  phone: z
    .string()
    .trim()
    .max(PHONE_MAX, { error: `Phone must be ${PHONE_MAX} characters or fewer.` }),
  // Validated only when present. z.email() on an empty string would refuse a
  // customer who simply has no email address.
  email: z.union([
    z.literal(""),
    z.email({ error: "Enter a valid email address, or leave it blank." }),
  ]),
  address: z
    .string()
    .trim()
    .max(ADDRESS_MAX, { error: `Address must be ${ADDRESS_MAX} characters or fewer.` }),
});

export type CustomerInput = z.infer<typeof customerSchema>;
