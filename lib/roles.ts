// The roles an owner may assign when ADDING someone.
//
// Owner is deliberately absent. add_member_by_email refuses it in the database
// too: allowing it would let an owner add a second owner who could then demote
// the first, a coup in two calls. An owner is made by promoting an existing
// member through set_member_role, which carries the last-owner guard.
//
// In its own module with no dependencies, because the select that renders it
// is a Client Component and importing it from a validation file would pull Zod
// into the browser.
export const ADDABLE_ROLES = [
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager" },
] as const;

export const ADDABLE_ROLE_VALUES = ADDABLE_ROLES.map(
  (role) => role.value
) as unknown as [string, ...string[]];
