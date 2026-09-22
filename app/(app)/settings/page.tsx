import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getExchangeRates } from "@/lib/queries/exchange-rates";
import { getSignedInProfile } from "@/lib/queries/profile";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Settings | Oja",
};

export default async function SettingsPage() {
  const profile = await getSignedInProfile();

  if (!profile) {
    redirect("/sign-in");
  }

  // Section 9.2: editing organisation settings is owner-only, alongside
  // managing staff. org_update in 0001 enforces the same rule, so a manager
  // who reached this page would be refused by RLS on save; the redirect is so
  // they are not shown a form that cannot succeed.
  if (profile.role !== "owner") {
    redirect("/");
  }

  // Fetched once here, for every currency at once, so choosing one in the
  // select shows its rate instantly with no second request and no spinner.
  // Null when the rate service is unreachable; the form copes.
  const rates = await getExchangeRates(profile.organisation.currency);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-display text-ink">Settings</h1>
        <p className="mt-1 text-caption text-ink-muted">
          These apply to the whole organisation. Only an owner can change them.
        </p>
      </div>

      <SettingsForm
        name={profile.organisation.name}
        currency={profile.organisation.currency}
        rates={rates}
      />
    </div>
  );
}
