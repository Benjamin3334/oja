-- ============================================================================
-- 0008 - Staff see only their own sales.
--
-- THE BUG
--   PRD section 9.2 draws a distinction: staff may "View own sales" but not
--   "View all sales". The policy in 0001 draws no distinction at all:
--
--       create policy sales_select on sales
--           for select using (org_id = current_org_id());
--
--   Every member of the organisation sees every sale. Section 9.1 principle 3
--   promises "UI hides what a role cannot do; RLS makes it impossible anyway",
--   and right now only the first half exists. A staff member who types a URL,
--   or reads the network tab, sees the whole day's takings.
--
-- THE FIX
--   Visibility is scoped by who recorded the sale, with owners and managers
--   exempt because oversight is their job.
--
--   sale_items is updated to match. It has no org_id of its own and reaches
--   through its parent sale, so leaving it on the old predicate would leak the
--   line items of sales whose headers are now hidden - the totals, the products
--   and the prices, everything except the header row. The same condition is
--   written out explicitly rather than relying on the policy on sales applying
--   to a sub-query inside another policy.
--
-- WHAT THIS DOES NOT COVER
--   Page-level access (the reports and staff pages) is a route-level role check
--   in the application, per decision 4. This migration only governs which rows
--   are visible once a page is reached.
--
--   sales_update still has no role check, so a staff member could in principle
--   set status = 'void' directly and bypass the role guard inside void_sale().
--   That is a write problem rather than a visibility one, and belongs in its
--   own migration.
--
-- CONSEQUENCE FOR THE APPLICATION
--   Dashboard figures become role-dependent: a staff member's "Revenue today"
--   shows their own takings, an owner's shows the whole shop. That is the
--   intended behaviour, but every query written against these tables must be
--   read with it in mind rather than assumed to be an organisation-wide total.
--
-- VERIFY AFTER RUNNING
--   As owner, count the sales. Demote yourself to staff inside a transaction,
--   count again, and the second count must include only sales where sold_by is
--   you. Roll back.
-- ============================================================================

drop policy if exists sales_select on sales;

create policy sales_select on sales
    for select using (
        org_id = current_org_id()
        and (
            sold_by = auth.uid()
            or current_user_role() in ('owner', 'manager')
        )
    );

drop policy if exists sale_items_all on sale_items;

create policy sale_items_all on sale_items
    for all
    using (
        exists (
            select 1 from sales s
            where s.id = sale_items.sale_id
              and s.org_id = current_org_id()
              and (
                  s.sold_by = auth.uid()
                  or current_user_role() in ('owner', 'manager')
              )
        )
    )
    with check (
        exists (
            select 1 from sales s
            where s.id = sale_items.sale_id
              and s.org_id = current_org_id()
              and (
                  s.sold_by = auth.uid()
                  or current_user_role() in ('owner', 'manager')
              )
        )
    );
