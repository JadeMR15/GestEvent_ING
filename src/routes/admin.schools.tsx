import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";
import { SchoolAccountsReview } from "@/components/SchoolAccountsReview";

export const Route = createFileRoute("/admin/schools")({
  component: () => (
    <AdminShell title="Écoles" subtitle="Vérifie que la demande vient bien de l'école (domaine email, nom) avant de lui ouvrir son espace.">
      {({ refresh }) => (
        <div className="mx-auto max-w-3xl">
          <SchoolAccountsReview onDecision={refresh} />
        </div>
      )}
    </AdminShell>
  ),
  head: () => ({ meta: [{ title: "Écoles — Plav'" }] }),
});
