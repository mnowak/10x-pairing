import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names with a space", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("lets a later conflicting Tailwind class win, via twMerge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
