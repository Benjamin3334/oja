import { z } from "zod";

import { ADDABLE_ROLE_VALUES } from "@/lib/roles";

// Shapes what the add-member form may send. The real controls are in
// add_member_by_email (0018), which re-checks the role, the caller's
// ownership, and whether the account exists - none of which a form can be
// trusted to have done.
export const addMemberSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }),
  role: z.enum(ADDABLE_ROLE_VALUES, {
    error: "Choose manager or staff.",
  }),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
