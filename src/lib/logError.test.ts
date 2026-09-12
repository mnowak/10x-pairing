import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "@/lib/logError";

describe("logError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs context, message, and stack for an Error input", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    logError("test-context", error);

    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(spy.mock.calls[0][0] as string) as {
      context: string;
      message: string;
      stack?: string;
    };
    expect(payload.context).toBe("test-context");
    expect(payload.message).toBe("boom");
    expect(payload.stack).toContain("boom");
  });

  it("logs a usable message for a non-Error input without a stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logError("test-context", "raw string failure");

    expect(spy).toHaveBeenCalledOnce();
    const payload = JSON.parse(spy.mock.calls[0][0] as string) as {
      context: string;
      message: string;
      stack?: string;
    };
    expect(payload.context).toBe("test-context");
    expect(payload.message).toBe("raw string failure");
    expect(payload.stack).toBeUndefined();
  });
});
