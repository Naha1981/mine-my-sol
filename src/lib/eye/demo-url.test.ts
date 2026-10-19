import { describe, expect, it } from "vitest";
import { buildSignalsDemoUrl } from "./demo-url";

describe("buildSignalsDemoUrl", () => {
  it("points to the signals route and uses the token parameter the route reads", () => {
    const url = new URL(buildSignalsDemoUrl("https://minemysol.example", "payload.signature"));

    expect(url.pathname).toBe("/signals");
    expect(url.searchParams.get("t")).toBe("payload.signature");
    expect(url.searchParams.has("demo")).toBe(false);
  });

  it("encodes token characters safely in a URL", () => {
    const url = new URL(
      buildSignalsDemoUrl(
        "https://minemysol.example",
        "payload+with/slash.signature",
      ),
    );

    expect(url.searchParams.get("t")).toBe("payload+with/slash.signature");
  });
});
