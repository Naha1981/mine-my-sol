import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationUpdates } from "@/lib/notification-updates";

const mocks = vi.hoisted(() => ({
  on: vi.fn(), subscribe: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(),
  invalidateQueries: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => mocks }));

describe("notification updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.channel.mockReturnValue(mocks);
    mocks.on.mockReturnValue(mocks);
    mocks.subscribe.mockReturnValue(mocks);
  });
  it("subscribes only to the current user's changes and refreshes badge and list", () => {
    const { unmount } = renderHook(() => useNotificationUpdates("test-user"));
    expect(mocks.on).toHaveBeenCalledWith("postgres_changes", {
      event: "*", schema: "public", table: "notifications", filter: "user_id=eq.test-user",
    }, expect.any(Function));
    mocks.on.mock.calls[0]![2]();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledWith(mocks);
  });
  it("removes the old subscription when the user changes", () => {
    const { rerender, unmount } = renderHook(({ id }) => useNotificationUpdates(id), { initialProps: { id: "first" } });
    rerender({ id: "second" });
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
    expect(mocks.channel).toHaveBeenLastCalledWith("notifications:second");
    unmount();
    expect(mocks.removeChannel).toHaveBeenCalledTimes(2);
  });
});
