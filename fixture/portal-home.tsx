// Fixture: renders the REAL portal Home component (stats, invitation card, opportunities
// and applications sections with the mt-8 grid) with mocked db + router. Pixel/overflow checks.
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home } from "../src/routes/_authenticated/portal.index";
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}><main className="px-4 pb-28 pt-6 lg:ml-64"><div className="mx-auto max-w-6xl"><Home /></div></main></QueryClientProvider>
);
