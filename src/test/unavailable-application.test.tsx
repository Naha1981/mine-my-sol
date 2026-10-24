import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ applicationId: "draft-id" }) }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/session", () => ({ useMe: () => ({ userId: "test", org: { id: "test-org" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const state = vi.hoisted(() => ({ loading: false, error: false, missing: false }));
vi.mock("@tanstack/react-query", () => ({
  queryOptions: (x: unknown) => x,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ isLoading: state.loading, isError: state.error, data: state.missing ? undefined : { a: { id: "draft-id", projects: null, status: "draft" }, reqs: [], ad: [] } }),
}));
beforeEach(() => { state.loading = false; state.error = false; state.missing = false; });
import { Route } from "@/routes/_authenticated/portal.applications.$applicationId";

it("keeps a saved application safe when its project is no longer readable", () => {
  const Page = Route.options.component!;
  render(<Page />);
  expect(screen.getByText("Opportunity unavailable")).toBeInTheDocument();
  expect(screen.getByText("Back to applications")).toBeInTheDocument();
  expect(screen.queryByText("Submit application")).not.toBeInTheDocument();
});

it("shows loading before interpreting unavailable data", () => {
  state.loading = true;
  const Page = Route.options.component!;
  render(<Page />);
  expect(screen.getByText("Loading…")).toBeInTheDocument();
  expect(screen.queryByText("Opportunity unavailable")).not.toBeInTheDocument();
});
it("does not present a read failure as a saved draft", () => {
  state.error = true;
  state.missing = true;
  const Page = Route.options.component!;
  render(<Page />);
  expect(screen.getByText("Application not found")).toBeInTheDocument();
  expect(screen.queryByText("Submit application")).not.toBeInTheDocument();
});
