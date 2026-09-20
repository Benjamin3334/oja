"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/actions/auth";
import { getSignedInProfile } from "@/lib/queries/profile";
import { createClient } from "@/lib/supabase/server";
import { customerSchema } from "@/lib/validation/customers";

function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (
    message.includes("uq_customer_phone_per_org") ||
    message.includes("duplicate key")
  ) {
    return "A customer with that phone number already exists.";
  }
  if (message.includes("row-level security")) {
    return "You do not have permission to do that.";
  }

  return "Could not save the customer. Please try again.";
}

// An empty string is not the absence of a phone number: the unique constraint
// is on (org_id, phone), and Postgres treats two empty strings as equal while
// treating two NULLs as distinct. Storing "" would therefore let the FIRST
// customer without a phone through and refuse every one after them. Blank
// fields become null here, once, so no caller has to remember it.
function blankToNull(value: string): string | null {
  return value === "" ? null : value;
}

function readCustomerForm(formData: FormData) {
  return {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    address: String(formData.get("address") ?? ""),
  };
}

export async function createCustomer(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(readCustomerForm(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const profile = await getSignedInProfile();

  if (!profile) {
    return { ok: false, error: "Your session has expired. Sign in again." };
  }

  // customers_all carries no role check: anyone who can record a sale can
  // record who it was for, which is the point of having customers at all.
  const supabase = await createClient();
  const { error } = await supabase.from("customers").insert({
    org_id: profile.organisation.id,
    full_name: parsed.data.fullName,
    phone: blankToNull(parsed.data.phone),
    email: blankToNull(parsed.data.email),
    address: blankToNull(parsed.data.address),
  });

  if (error) {
    console.error("[customers.createCustomer]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/customers");
  redirect("/customers");
}

export async function updateCustomer(
  customerId: string,
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(readCustomerForm(formData));

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      full_name: parsed.data.fullName,
      phone: blankToNull(parsed.data.phone),
      email: blankToNull(parsed.data.email),
      address: blankToNull(parsed.data.address),
    })
    .eq("id", customerId);

  if (error) {
    console.error("[customers.updateCustomer]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  redirect(`/customers/${customerId}`);
}
