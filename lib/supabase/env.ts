// Supabase environment variables, read and validated once when this module is
// first imported.
//
// Without this, a missing variable surfaces as an opaque failure deep inside
// the Supabase client. Here it fails immediately, naming the variable that is
// missing and how to fix it.
//
// IMPORTANT: the value is passed in as an argument rather than looked up as
// process.env[name] inside the helper. Next.js replaces NEXT_PUBLIC_* variables
// by textual substitution at build time, so it only recognises a literal
// `process.env.NEXT_PUBLIC_FOO`. A dynamic lookup is never substituted and
// would read as undefined in the browser bundle.

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in from ` +
        `Supabase Dashboard > Project Settings > API, then restart the dev server.`
    );
  }

  return value;
}

export const SUPABASE_URL = requireEnv(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

// The anon key only. It is designed to be public and reaches the browser;
// Row-Level Security is what protects the data. The service_role key bypasses
// RLS entirely and must never appear in application code (02_CLAUDE.md 5.1).
export const SUPABASE_ANON_KEY = requireEnv(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
