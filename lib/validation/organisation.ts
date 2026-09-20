import { z } from "zod";

// Rules for creating an organisation. Shared by the form and the Server Action,
// so they cannot drift.
//
// These mirror the guards inside create_organisation_and_profile(), which
// raises on a blank name. The database check is the real control; this one
// exists so the user gets a sentence instead of a raised exception.

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;

export const createOrganisationSchema = z.object({
  organisationName: z
    .string()
    .trim()
    .min(NAME_MIN_LENGTH, { error: "Enter the name of your organisation." })
    .max(NAME_MAX_LENGTH, {
      error: `Organisation name must be ${NAME_MAX_LENGTH} characters or fewer.`,
    }),
  fullName: z
    .string()
    .trim()
    .min(NAME_MIN_LENGTH, { error: "Enter your full name." })
    .max(NAME_MAX_LENGTH, {
      error: `Name must be ${NAME_MAX_LENGTH} characters or fewer.`,
    }),
});

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
