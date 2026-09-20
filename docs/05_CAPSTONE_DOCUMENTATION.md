# Capstone Project Documentation
### Oja — Small Business & Institution Operations System
**Benjamin John Abakasanga · Topfaith University · SIWES / SVSAP 4-Week Industrial Training**

Date: ________________  Industry Supervisor: ________________

---

## 0. How this document maps to the assessment brief

Section 5.4 of the training plan requires seven documentation artefacts. This table is the first thing your supervisor should see — it proves nothing is missing.

| # | Required by §5.4 | Where it is | Status |
|---|---|---|---|
| 1 | Network diagram | `04_NETWORK_DESIGN.md` §7 + §2 of this document | ☐ |
| 2 | IP addressing table | `04_NETWORK_DESIGN.md` §5 | ☐ |
| 3 | Database ERD | `01_PRD.md` §6.1 + §3 of this document | ☐ |
| 4 | SQL scripts | `03_schema.sql` (DDL, views, functions, policies, queries §9) | ☐ |
| 5 | Application screenshots | §4 of this document | ☐ |
| 6 | Explanation of how AI was used at each stage | §6 of this document | ☐ |
| 7 | Problems encountered and how they were resolved | §7 of this document | ☐ |

Additional artefacts beyond the brief (these are what lift a grade): the **PRD** (`01_PRD.md`), the **engineering standards file** (`02_CLAUDE.md`), the **presentation script** (§8), and the **defence question bank** (`07_DEFENSE_QUIZ.md`).

---

## 1. Project summary

| | |
|---|---|
| **Title** | Oja — a multi-tenant operations console for small businesses, schools and institutions |
| **Problem** | A small organisation cannot answer, at any moment: what do we have, what did we sell, and who did it? |
| **Solution** | One web application covering Inventory, Sales, Customers, Staff and Reports, with stock derived from an auditable movement ledger |
| **Stack** | Next.js 15 · TypeScript · Tailwind CSS · Supabase (PostgreSQL, Auth, Row-Level Security) · Vercel |
| **Duration** | 4 weeks (20 working days), capstone built in week 4 |
| **Live URL** | ________________________ |
| **Repository** | ________________________ |

### 1.1 Objectives achieved
1. Designed and documented a VLSM addressing plan for a six-department site on a single /24.
2. Designed a 3NF relational schema including a junction table resolving a many-to-many relationship.
3. Enforced authorisation inside the database using PostgreSQL row-level security rather than in application code.
4. Built a working application using Claude Code and Codex, with every output verified independently.
5. Produced full technical documentation and a defended presentation.

---

## 2. Network design (summary)

Full detail in `04_NETWORK_DESIGN.md`. In brief:

- Site block: **192.168.10.0/24**, six segments totalling **118 host addresses**.
- **VLSM was required**: fixed-length /26 subnets would need 384 addresses and cannot fit in a /24.
- Allocation, largest first: Sales **/26**, Guest **/27**, Admin **/27**, Inventory **/28**, Servers **/29**, Management **/30** — 156 addresses used, **100 reserved for growth**.
- Each segment is a separate VLAN and broadcast domain, routed by a layer-3 switch with inter-VLAN ACLs.
- The application tier is off-site; outbound access is restricted to **TCP 443**, so the network's contribution is segmentation and controlled egress.

*(Paste the diagram from `04_NETWORK_DESIGN.md` §7 here, or redraw it in Cisco Packet Tracer / draw.io and insert the image.)*

---

## 3. Database design (summary)

Full DDL in `03_schema.sql`; ERD in `01_PRD.md` §6.1.

**Eight tables:** `organisations`, `profiles`, `categories`, `products`, `customers`, `sales`, `sale_items`, `stock_movements`.

**Relationships:**
| Relationship | Type | Implemented by |
|---|---|---|
| organisation → profiles / products / sales … | one-to-many | `org_id` foreign key on each child |
| auth user → profile | one-to-one | `profiles.id` is both PK and FK to `auth.users.id` |
| category → products | one-to-many | `products.category_id` |
| customer → sales | one-to-many (optional) | `sales.customer_id`, nullable for walk-ins |
| **sales ↔ products** | **many-to-many** | **`sale_items` junction table** carrying `quantity` and `unit_price` |
| product → stock movements | one-to-many | `stock_movements.product_id` |

**Normalisation:** taken from an unnormalised paper receipt through 1NF (remove the repeating group of line items), 2NF (remove partial dependencies — product name and category depend only on `product_id`, part of the composite key), to 3NF (remove transitive dependencies — category name depends on `category_id`, not on the product). Full walk-through in `01_PRD.md` §6.3.

**Deliberate design decisions to defend:**
1. Current stock is **derived** from `stock_movements`, never stored — so every change is attributable and the value cannot silently drift.
2. `sale_items.unit_price` is a **historical snapshot**, not redundancy; it keeps old receipts correct after a price change.
3. `line_total` is a **generated column**, computed by PostgreSQL and impossible to desynchronise.
4. Nothing is ever deleted: products are deactivated, sales are voided with compensating stock movements.
5. **Row-Level Security** on every table means a user physically cannot read another organisation's rows, even if the front end is bypassed.

---

## 4. Application screenshots

Capture these six, in this order, at 1440×900 with realistic seed data (never an empty screen, never `lorem ipsum`):

| # | Screen | What the caption must say |
|---|---|---|
| 1 | Sign-in | Supabase Auth; session carried in an httpOnly cookie |
| 2 | Dashboard | Four KPIs, 14-day revenue chart, low-stock list, top sellers — all computed by SQL aggregation, not in the browser |
| 3 | Inventory list | Derived stock column from `v_product_stock`; amber "Low" badge where stock ≤ reorder level |
| 4 | New sale | Multi-line sale being built; total computed from generated `line_total` column |
| 5 | Oversell blocked | The error raised by `complete_sale()` — proof the rule lives in the database |
| 6 | Sale detail / void | Voided sale showing compensating stock movements in the ledger |

> **Do not skip screenshot 5.** A screenshot of your system *refusing* an invalid operation is worth more than five screenshots of happy paths, because it demonstrates that you understand where business rules belong.

---

## 5. Testing performed

| Test | Method | Expected | Result |
|---|---|---|---|
| Stock accuracy | Receive 100, sell 7, adjust −2 | 91 | ☐ |
| Oversell guard | Attempt to sell 200 of a 91-stock item | Exception, transaction rolled back, stock unchanged | ☐ |
| Atomicity | Sale with 3 lines where line 3 oversells | **No** stock deducted for lines 1 and 2 | ☐ |
| Price history | Change unit price after a sale, reopen the old sale | Old sale shows the old price | ☐ |
| Tenant isolation | Sign in as a user of a second organisation | Zero rows from the first organisation | ☐ |
| Role enforcement | Sign in as `staff`, attempt to open Reports and to void a sale | Blocked in UI and refused by the database | ☐ |
| Void behaviour | Void a completed sale | Status `void`, stock restored, nothing deleted | ☐ |
| Accessibility | Tab through the new-sale screen | Every control reachable, focus always visible | ☐ |
| Responsiveness | 375 px viewport | No horizontal scroll, tables scroll internally | ☐ |

---

## 6. How AI was used at each stage

The brief requires this section. It is also the section your supervisor will interrogate hardest, because it is where a student either demonstrates judgement or reveals that the assistant did the thinking. Fill in the real prompts as you go — an honest log of nine entries beats a polished log of thirty.

### 6.1 Tools and division of labour
| Tool | Used for | Why |
|---|---|---|
| **Claude Code** | Architecture and planning, schema design review, multi-file refactors, explaining unfamiliar code, writing documentation | Strong at reasoning across a whole repository and at explaining *why* |
| **Codex** | Focused code generation inside a single file, boilerplate components, repetitive transformations, test scaffolding | Fast at localised, well-specified completions |
| **Both** | Debugging — pasting the actual error and the relevant file, never "it doesn't work" | Two independent opinions surface hallucinations quickly |

### 6.2 Usage log (template — replace with your real entries)

| # | Stage | What I asked for (summary) | What it produced | How I verified it |
|---|---|---|---|---|
| 1 | Planning | A module breakdown for a small-business operations MVP, with an explicit non-goals list | Seven modules; suggested three I rejected (payments, barcode, mobile) | Checked each module against the brief in §5 of the training plan; cut anything not deliverable in five days |
| 2 | Schema | A review of my ERD for normalisation violations | Flagged that storing `total` on `sales` duplicates data derivable from `sale_items` | Recomputed both by hand on 3 sales; replaced the column with the `v_sale_totals` view |
| 3 | Schema | "Should current stock be a column or derived?" | Argued for a movement ledger with trade-offs both ways | Accepted the ledger, but tested the `SUM` cost with 5,000 seeded movements before committing |
| 4 | SQL | Row-level security policies for a multi-tenant schema | Policies using `auth.uid()` directly in each table | Rejected: it would join `profiles` on every row. Rewrote as a `security definer` helper `current_org_id()`, then tested with two accounts |
| 5 | Code | A Server Action to create a sale with its line items | Code using a non-existent `.transaction()` method on the Supabase client | **Hallucination caught.** Checked the Supabase JS docs — no such method. Moved the logic into the PostgreSQL function `complete_sale()` instead |
| 6 | Debugging | Pasted the exact error `column line_total can only be updated to DEFAULT` | Explained that generated columns cannot be inserted into | Removed `line_total` from the insert payload; re-ran; passed |
| 7 | Refactor | Extract repeated table markup into a reusable `DataTable` primitive | A generic component with five props | Reduced to three props I could explain; rejected the generic type parameter I did not understand |
| 8 | Review | "Review this file for security issues" | Flagged the service-role key in a client component | Confirmed by reading the Supabase docs on key scopes; moved to server-only and rotated the key |
| 9 | Docs | Draft the troubleshooting section of the network document | Generic list | Replaced three items with faults I actually hit during the build |

### 6.3 Limitations observed (name at least three real ones in the viva)
1. **Confident invention of APIs.** Methods that sound right (`supabase.transaction()`) but do not exist. Every unfamiliar API call was checked against official documentation before use.
2. **Outdated patterns.** Suggestions based on the Next.js Pages Router rather than the App Router, and on the older `auth-helpers` package rather than `@supabase/ssr`.
3. **Plausible-but-wrong SQL.** Policies that were syntactically valid but let a user promote their own role; caught only by testing with a second account.
4. **Over-engineering.** Abstractions offered before they were needed, which would have been undefendable in a viva.
5. **No knowledge of my context.** It cannot know the reorder levels, the currency, or the department sizes — only I can supply those.

### 6.4 The verification rule I followed
> **Read it → run it → break it → check the source.**
> Nothing was committed until I could explain it line by line without reopening the chat. Where an assistant and the official documentation disagreed, the documentation won.

### 6.5 Responsible-use notes
- No customer or personal data was pasted into an assistant; all test data is fictional.
- No secrets, keys or connection strings appeared in any prompt.
- AI-generated code was reviewed for injection risk, secret handling and authorisation before merging.
- AI assistance is disclosed here in full; the design decisions, the verification and the defence are mine.

---

## 7. Problems encountered and how they were resolved

Replace with your own as they happen — keep the structure: **symptom → cause → fix → lesson**.

| # | Problem | Root cause | Resolution | Lesson |
|---|---|---|---|---|
| 1 | Every query returned an empty array although rows existed in the table editor | RLS was enabled but the policy compared `org_id` to `auth.uid()` instead of the user's organisation | Introduced the `current_org_id()` helper as `security definer` and rewrote every policy | RLS fails *silently* — an empty result is a permission symptom, not only a query bug |
| 2 | Infinite recursion error on the `profiles` policy | The policy on `profiles` called a function that itself selected from `profiles` | Marked the helper `security definer` with a fixed `search_path` | Policies must not depend on the table they protect |
| 3 | `column "line_total" can only be updated to DEFAULT` | The insert payload included the generated column | Removed it; the database computes it | Generated columns are outputs, never inputs |
| 4 | Stock briefly went negative during testing | The application checked stock, then inserted — a race between the two statements | Moved the check and the insert into one `complete_sale()` function so they run in a single transaction | Business rules belong where the data is, not in the client |
| 5 | "Today's revenue" was wrong for sales made after 11 pm | Aggregating a `timestamptz` in UTC while the shop operates in WAT | `date_trunc('day', sold_at at time zone 'Africa/Lagos')` | Always aggregate dates in the business's own time zone |
| 6 | An AI-suggested Supabase transaction method did not exist | Hallucinated API | Verified against the documentation; used a PostgreSQL function instead | Never commit an API call you have not seen in the docs |
| 7 | Duplicate SKUs across two organisations were rejected | Unique constraint was global rather than per tenant | Changed to `unique (org_id, sku)` | In multi-tenant schemas, uniqueness is almost always *per tenant* |
| 8 | A `staff` user could open the reports page by typing the URL | Authorisation existed only in the navigation UI | Added the role check to the policy and to the route | Hiding a button is not access control |

---

## 8. Presentation script (10–15 minutes)

Rehearse this aloud **twice** before the day. Timings are deliberate; the demo is the middle third, not the whole thing.

### 0:00–1:00 · Open with the problem, not the technology
> "Good morning. Over the last four weeks I studied subnetting, database development and AI-assisted development. For my capstone I built Oja — an operations system for a small business, school or institution.
> The problem is simple. A small organisation cannot answer three questions at any given moment: what do we have, what did we sell, and who did it. The stock book is in a notebook, the sales are a total with no detail, and the answer usually lives in one person's memory. Oja replaces that notebook."

### 1:00–3:00 · The network (hold up the IP table)
> "The system is used by staff across six departments, so I designed the site network first. One /24, 118 host addresses needed, but the largest department needs 50 and the smallest needs 2.
> Fixed-length subnetting fails here: every subnet would have to be a /26, six times 64 is 384 addresses, and a /24 only has 256. So I used VLSM and allocated largest first — Sales a /26, Guest and Admin a /27 each, Inventory a /28, Servers a /29, and the management link a /30. 156 addresses used, 100 reserved for growth.
> Each department is its own VLAN and its own broadcast domain, routed by a layer-3 switch with ACLs between them. Guest Wi-Fi reaches the internet and nothing else. Because the database is a managed cloud instance, the firewall only needs to allow outbound 443."

### 3:00–5:30 · The database (show the ERD)
> "Eight tables. The relationship that matters is between sales and products: one sale contains many products and one product appears in many sales — many-to-many, which a relational database cannot store directly. I resolved it with the `sale_items` junction table, which carries its own attributes: quantity and the price actually charged.
> I normalised from a paper receipt. First normal form removed the repeating group of line items. Second normal form removed partial dependencies — product name depends only on the product, not on the whole composite key. Third normal form removed the transitive dependency of category name on the product.
> Two decisions I want to highlight. First, current stock is not a column — it is derived from a movement ledger, so every change is attributable to a person, a time and a reason. Second, `sale_items` stores the price at the time of sale. That looks like duplication but it is not: it is a historical fact, and it is what keeps last month's receipts correct after a price change.
> Finally, authorisation is in the database. Every table has row-level security, so a user from one organisation cannot read another's rows even if the front end is bypassed entirely."

### 5:30–10:00 · Live demo (strict order, no exploring)
1. Sign in → dashboard. *"Every figure here is a SQL aggregate, not a loop in the browser."*
2. Inventory → point at the derived stock column and a low-stock badge.
3. New sale → three line items, attach a customer, complete. *"The total is a generated column."*
4. Back to inventory → **stock has dropped by exactly the quantities sold.**
5. **Attempt to oversell** → show the refusal. *"That rule is a PostgreSQL function, not JavaScript. It cannot be bypassed by the browser."*
6. Void the sale → show stock restored and the compensating rows in the movement ledger. *"Nothing is ever deleted."*
7. Reports → revenue by period and top products.

### 10:00–12:00 · AI-assisted development (the honest section)
> "I used Claude Code for architecture, review and explanation, and Codex for focused generation inside single files. I kept a log of every significant interaction.
> The most useful thing it did was review my schema and point out that storing a total on the sale duplicated data derivable from the line items. I verified that by hand and replaced it with a view.
> The most instructive thing it did was invent a method that does not exist — a `transaction()` call on the Supabase client. It looked completely plausible. I checked the documentation, found nothing, and moved the logic into a PostgreSQL function instead, which was the better design anyway.
> My rule throughout: read it, run it, break it, check the source. Nothing was committed until I could explain it line by line without reopening the chat — which is exactly why I can answer your questions about any file in this project."

### 12:00–13:00 · Close
> "In four weeks this went from three separate topics to one system: a segmented network, a normalised database with authorisation at the data layer, and an application built with AI assistance that I can fully account for.
> If I continued, the next three things would be receipt printing, a supplier and purchase-order module, and offline support for tills — in that order, because that is the order the user feels the pain.
> Thank you. I am happy to take questions."

### 13:00–15:00 · Questions
See `07_DEFENSE_QUIZ.md`. If you do not know an answer: **"I did not implement that. What I would do is X, because Y."** Never bluff — a wrong confident answer costs more than an honest boundary.

---

## 9. Demo-day checklist

**The night before**
- [ ] Deployed URL loads on a phone hotspot, not just campus Wi-Fi
- [ ] Seed data reset to a clean, realistic state (10 products, 3 customers, ~8 sales over 14 days)
- [ ] A second organisation account exists, ready to prove tenant isolation
- [ ] One product deliberately left in low stock so the badge appears
- [ ] Screen recording of the full demo saved locally **and** on the phone (fallback if the network fails)
- [ ] All documents exported to PDF and on a flash drive
- [ ] Browser zoom at 110%, bookmarks bar hidden, notifications off, dark-mode extensions disabled

**Ten minutes before**
- [ ] Log in already done, dashboard open in tab 1
- [ ] Tab 2: ERD · Tab 3: IP addressing table · Tab 4: `03_schema.sql`
- [ ] Laptop on mains power, screen sleep disabled

**Never do on stage**
- Open a code file you have not read that morning.
- Say "the AI generated that part".
- Apologise for the project before you have presented it.

---

## 10. Sign-off

| Role | Name | Signature / Date |
|---|---|---|
| Intern | Benjamin John Abakasanga | |
| Industry Supervisor | | |
| Institutional Supervisor | | |
