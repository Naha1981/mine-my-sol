// Static hosting has no request-specific server HTML. Mount the SPA instead of
// hydrating the root-only shell against an authenticated deep-link route.
import { StrictMode, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
startTransition(() => {
  createRoot(document).render(
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
