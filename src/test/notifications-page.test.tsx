import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ error: false, loading: false, refetch: vi.fn(), push: vi.fn(), toast: vi.fn(), invalidate: vi.fn(), is: vi.fn(), eq: vi.fn(), update: vi.fn(), from: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ history: { push: m.push } }) }));
vi.mock("sonner", () => ({ toast: { error: m.toast } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: m }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: m.invalidate }), useQuery: () => ({ isLoading: m.loading, isError: m.error, refetch: m.refetch, data: [{ id: "n", title: "Test notification", link: "/portal", created_at: new Date().toISOString() }] }) }));
import { NotificationsPage } from "@/components/app/Notifications";
beforeEach(() => { vi.clearAllMocks(); m.error = false; m.loading = false; m.from.mockReturnValue(m); m.update.mockReturnValue(m); m.is.mockResolvedValue({ error: { message: "write failed" } }); m.eq.mockResolvedValue({ error: { message: "write failed" } }); });
it("shows and retries read errors rather than an empty inbox", () => {
  m.error = true; render(<NotificationsPage />);
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.queryByText("No notifications yet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Try again")); expect(m.refetch).toHaveBeenCalled();
});
it("keeps navigation blocked when marking a notification read fails", async () => {
  render(<NotificationsPage />); fireEvent.click(screen.getByText("Test notification"));
  await waitFor(() => expect(m.toast).toHaveBeenCalledWith("write failed"));
  expect(m.push).not.toHaveBeenCalled(); expect(m.invalidate).not.toHaveBeenCalled();
});
it("reports mark-all failures without claiming success", async () => {
  render(<NotificationsPage />); fireEvent.click(screen.getByText("Mark all read"));
  await waitFor(() => expect(m.toast).toHaveBeenCalledWith("write failed"));
  expect(m.invalidate).not.toHaveBeenCalled();
});
