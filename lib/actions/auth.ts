"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";

// The contract from 02_CLAUDE.md section 5.2, as amended: a failed action
// returns { ok: false, error }, and a successful one calls redirect().
// redirect() works by throwing, so it is never called inside a try block and
// never returns, which is why the ok: true branch is unreachable for signIn
// and signUp. The union is kept whole so the shape matches the written rule.
export type ActionResult = { ok: true } | { ok: false; error: string };

// Supabase and Postgres errors are never shown to the user: they leak
// implementation detail and read as noise. The real message goes to the server
// log, and the user gets a sentence they can act on.
function toUserMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "That email or password is not correct.";
  }
  if (message.includes("email not confirmed")) {
    return "Confirm your email address, then sign in.";
  }
  if (message.includes("already registered") || message.includes("already exists")) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (message.includes("rate limit") || message.includes("too many")) {
    return "Too many attempts. Wait a minute and try again.";
  }
  if (message.includes("password")) {
    return "That password was rejected. Choose a longer one.";
  }

  return "Something went wrong. Please try again.";
}

// FormData values are typed as string | File | null. Coercing at the boundary
// guarantees Zod sees a string, so a crafted request with a missing field gets
// the written validation message rather than a type error.
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signIn(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    console.error("[auth.signIn]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  // Server Components cache per-request. Without this the shell could render
  // with the previous (signed-out) session still in view.
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signUp(
  _previous: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    fullName: field(formData, "fullName"),
    email: field(formData, "email"),
    password: field(formData, "password"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Stored on the auth user as raw_user_meta_data. The onboarding RPC reads
      // it when it creates the profile row, so the name collected here is not
      // lost between sign-up and profile creation.
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    console.error("[auth.signUp]", error.message);
    return { ok: false, error: toUserMessage(error.message) };
  }

  // Only reachable if email confirmation is switched on for the project. With
  // it off (the setting chosen for the demo) signUp returns a session straight
  // away. Without this branch the user would be redirected to / and then
  // bounced back to /sign-in by the middleware with no explanation.
  if (!data.session) {
    return {
      ok: false,
      error: "Account created. Check your email for the confirmation link, then sign in.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    // Logged, not surfaced: there is nothing useful the user can do about it,
    // and they are being sent to the sign-in page regardless.
    console.error("[auth.signOut]", error.message);
  }

  revalidatePath("/", "layout");
  redirect("/sign-in");
}
