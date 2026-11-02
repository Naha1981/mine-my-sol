// Fixture: renders the REAL InvitationCodeEntry component with a mocked db module.
// States via ?state=form|success|error. No network, no live data.
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvitationCodeEntry } from "../src/routes/_authenticated/portal.index";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const state = new URLSearchParams(location.search).get("state") ?? (window).__fixtureState ?? "form";

function Harness() {
  const [accepted, setAccepted] = React.useState(false);
  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <QueryClientProvider client={qc}>
        {state === "success" || accepted ? <SuccessView /> : <InvitationCodeEntry />}
        {state === "error" && <ErrorView />}
      </QueryClientProvider>
    </div>
  );
}
function SuccessView() {
  return (
    <section className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p style={{ fontWeight: 600 }}>Invitation accepted</p>
      <p style={{ fontSize: 14, opacity: 0.7 }}>NahaLabs QA TestCo can now see your company and invite you to their projects.</p>
    </section>
  );
}
function ErrorView() {
  return <p style={{ marginTop: 8, fontSize: 14, color: "crimson" }}>Invalid or expired invitation code</p>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
