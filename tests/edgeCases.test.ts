import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("edgeCases", () => {
  test("circular references", () => {
    // Arrange
    const input: any = { name: "test" };
    input.self = input; // circular reference

    const rules: SanitizerRules = {
      name: "mask",
    };

    // Act/Assert - should not crash with stack overflow
    expect(() => sanitize(input, { rules })).not.toThrow();
  });

  test("extremely deep objects", () => {
    // Arrange
    let input: any = { value: "deepest" };
    let current = input;

    // Create a very deep object
    for (let i = 0; i < 100; i++) {
      current.child = { value: i };
      current = current.child;
    }

    const rules: SanitizerRules = {
      value: "mask", // should mask all values
    };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    expect(result.value).toMatch(/^\*+$/);
    expect(result.child.value).toMatch(/^\*+$/);
  });

  test("unusual key names", () => {
    // Arrange
    const input = {
      "key.with.dots": "value1",
      "key with spaces": "value2",
      "": "empty key",
      123: "numeric key",
      "[weird]": "bracket key",
    };

    const rules: SanitizerRules = {
      "key.with.dots": "redact",
      "key with spaces": "mask",
      "": "random",
      "123": "mask",
      "[weird]": "redact",
    };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    expect(result["key.with.dots"]).toBe("[REDACTED]");
    expect(result["key with spaces"]).toMatch(/^\*+$/);
    expect(result[""]).not.toBe("empty key");
    expect(result["123"]).toMatch(/^\*+$/);
    expect(result["[weird]"]).toBe("[REDACTED]");
  });
});
