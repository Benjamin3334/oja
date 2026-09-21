# CLAUDE.md

> Project instructions for Claude Code / Codex working in this repository.
> Read this file completely before writing any code. If a request conflicts with this file, say so and ask.

---

## 1. What this project is

**Oja** — a multi-tenant operations console for small businesses, schools and institutions. Five modules: Inventory, Sales, Customers, Staff, Reports.

It is a **SIWES capstone MVP**. Two consequences that override normal engineering instincts:

1. **The author must be able to explain every line.** Prefer the obvious implementation over the clever one. No unexplained abstractions, no metaprogramming, no "smart" generics. If two approaches are equally correct, choose the one that is easier to defend out loud in a viva.
2. **Scope is frozen.** See `docs/01_PRD.md` §3.2. Do not add features that were not asked for. If you think something is missing, say so in one sentence and wait.

The full specification is `docs/01_PRD.md`. The database contract is `supabase/migrations/`. Treat both as the source of truth.

---

## 2. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Server Components by default |
| Styling | Tailwind CSS v4 + CSS custom properties | Tokens in `app/globals.css` |
| Database | Supabase PostgreSQL | RLS enabled on every table |
| Auth | Supabase Auth — email/password, Google OAuth optional | |
| Data access | `@supabase/ssr` | Cookie session |
| Validation | Zod | One schema shared by client and server |
| Charts | Recharts | |
| Icons | `lucide-react`, 1.5px stroke, 18px default | |
| Deploy | Vercel | |

## 3. Commands

```bash
npm run dev            # local dev server
npm run build          # must pass before every commit
npm run lint
npm run typecheck      # tsc --noEmit
npx supabase gen types typescript --project-id <id> > types/database.types.ts
```

## 4. Directory layout

```
app/(auth)/…            sign-in, sign-up, callback
app/(app)/…             authenticated shell + module routes
components/ui/          primitives only — no data fetching inside
components/app/         composed, domain-aware components
lib/supabase/           server.ts, client.ts, middleware.ts
lib/queries/            read functions, one file per domain, returns typed rows
lib/actions/            server actions (mutations) — "use server" at top of file
lib/validation/         Zod schemas
supabase/migrations/    ordered .sql files — the only place schema changes live
docs/                   PRD, network design, capstone documentation
```

---

## 5. Hard rules

### 5.1 Database
- **Never** use the `service_role` key in application code. Browser and server both use the anon key so that RLS applies. The service key belongs only in one-off local scripts, never committed.
- **Never** change the schema by clicking in the Supabase dashboard. Write a new file in `supabase/migrations/`, run it in the SQL editor, and commit it. The migration folder must be able to rebuild the database from empty.
- Every tenant table carries `org_id uuid not null references organisations(id)` and has RLS enabled with a policy based on `current_org_id()`.
- Never store current stock on `products`. Stock is `SUM` over `stock_movements` via `v_product_stock`.
- Money is `numeric(12,2)`. Never `float`. Never do money arithmetic in JavaScript when SQL can do it.
- Multi-step writes (completing a sale, voiding a sale) go in a PostgreSQL function so they are one atomic transaction.
- No `SELECT *` in application queries; name the columns you need.

### 5.2 Next.js
- Fetch data in Server Components. `"use client"` only for components that need state, effects or event handlers — and put it as low in the tree as possible.
- Mutations are Server Actions: `validate (Zod) → call Supabase → handle error → revalidatePath(...)`. Return `{ ok: true }` or `{ ok: false, error: string }`; never throw raw Postgres errors at the user.
- No `useEffect` fetch-on-mount for data the server can render.
- Loading states use `loading.tsx` with skeletons, not spinners.

### 5.3 Design (see `docs/01_PRD.md` §8 — "Quiet Instrument")
- Use the CSS variables. Never hard-code a hex value in a component.
- Spacing only from the scale: 4, 8, 12, 16, 24, 32, 48, 64.
- Borders, not shadows. Elevation only on dialogs and popovers.
- `--accent` is reserved for the primary action and the active nav item. Nothing else.
- Fonts: Instrument Serif (display), Geist (UI **and** all numerals, with `tabular-nums` + `font-feature-settings: "tnum"`). Money is right-aligned everywhere. KPI figures are Geist 600 at `-0.02em`.
- The naira sign comes from Noto Sans, which sits second in the numeral stack purely so the browser's per-glyph fallback can supply U+20A6 — Geist does not contain it (verified by parsing the font's `cmap`). Never assume a font has a currency glyph because its declared `unicode-range` covers the codepoint; the range says what a subset is meant to serve, not what is in it.
- **Banned:** purple/blue gradients, emoji as icons, stacked drop shadows, Inter/Roboto/Arial, decorative illustrations, more than one primary button per screen, animation longer than 200 ms.
- Every interactive element keeps a visible focus ring. Never `outline: none` without a replacement.
- Every list has a designed empty state that names the next action.

### 5.4 TypeScript
- `strict: true`. No `any` — use `unknown` and narrow.
- Types for database rows come from `types/database.types.ts`; do not hand-write row interfaces.
- Name things in full: `stockMovement`, not `sm`.

---

## 6. How to work with me (the author)

1. **Plan before code.** For any task larger than one file, output a short plan (files touched, order of work) and wait for approval.
2. **Explain as you go.** After generating a non-trivial function, add 2–4 lines under it in chat explaining *why* it works, in plain English. I have to defend this in a viva.
3. **Flag uncertainty.** If you are not sure an API exists, say "I am not certain this method exists — verify against the Supabase docs" instead of producing confident code.
4. **One concern per change.** Do not refactor unrelated code while fixing a bug.
5. **No silent dependencies.** Ask before adding any package.
6. **Comments explain intent, not syntax.** `// snapshot the price so historical sales stay accurate`, never `// loop through items`.

### Commit convention
`type(scope): summary` — e.g. `feat(sales): block oversell at trigger level`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`.

---

## 7. Definition of done for any feature

- [ ] `npm run build` and `npm run typecheck` pass
- [ ] Works when logged in as `staff` **and** as `owner` (role behaviour is correct)
- [ ] A user from another organisation cannot see the data (verified with a second account)
- [ ] Empty state, loading state and error state all exist
- [ ] Keyboard-only navigation works and focus is visible
- [ ] Money is tabular, right-aligned, and formatted with the organisation's currency
- [ ] The author can explain every line without opening the chat history

---

## 8. Known traps in this codebase

| Trap | What to do |
|---|---|
| RLS silently returns zero rows instead of an error | If a query returns `[]` unexpectedly, test the same SQL in the Supabase editor with the user's JWT before assuming the query is wrong |
| `auth.uid()` is null in a plain SQL editor session | Policies can only be tested properly through the app or with an impersonated role |
| Server Action returns stale UI | You forgot `revalidatePath` |
| Dates shift by an hour | Store `timestamptz`; aggregate with `AT TIME ZONE 'Africa/Lagos'` |
| Generated column rejected on insert | `line_total` is `GENERATED ALWAYS … STORED` — never insert into it |
| Supabase `.select()` on a join returns nested objects | Destructure explicitly; do not assume a flat row |

---

## 9. Things you must never do

- Commit `.env.local`, any key, or a database URL.
- Delete rows from `sales`, `sale_items` or `stock_movements`. Void and compensate instead.
- Disable RLS "temporarily to test".
- Hard-delete a product that has sales history.
- Install a UI kit that replaces the design tokens.
- Write a feature that is not in the PRD.
