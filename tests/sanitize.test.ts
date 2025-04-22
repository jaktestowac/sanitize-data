import { test, expect, describe } from "vitest";
import { sanitize } from "../src/sanitize";

describe("sanitize", () => {
  test("top-level key match", () => {
    // Arrange
    const input = { email: "a@b.com", name: "John" };
    const rules = { email: "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result).toEqual({ email: "[REDACTED]", name: "John" });
  });

  test("low-level key match", () => {
    // Arrange
    const input = { user: { email: "a@b.com", name: "John" } };
    const rules = { email: "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result).toEqual({ user: { email: "[REDACTED]", name: "John" } });
  });

  test("only top-level key match", () => {
    // Arrange
    const input = { name: "abc", user: { email: "a@b.com", name: "John" } };
    const rules = { name: "redact" };
    // Act
    const result = sanitize(input, { rules, keyMatchAnyLevel: false });
    // Assert
    expect(result).toEqual({ name: "[REDACTED]", user: { email: "a@b.com", name: "John" } });
  });

  test("user.* matches one level deep", () => {
    // Arrange
    const input = { user: { name: "Alice", age: 30, meta: { city: "NY" } } };
    const rules = { "user.*": "mask" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.user.name).toMatch(/^\*+$/);
    expect(result.user.age).toMatch(/^\*+$/);
    expect(result.user.meta).toEqual({ city: "NY" });
  });

  test("user.** matches nested keys recursively - redact", () => {
    // Arrange
    const input = { user: { name: "Bob", meta: { city: "LA", zip: 90001 } } };
    const rules = { "user.**": "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.user, JSON.stringify(result)).toBe("[REDACTED]");
    expect(result.user.name, JSON.stringify(result)).toBe(undefined);
  });

  test("user.** matches nested keys recursively - masked", () => {
    // Arrange
    const input = { user: { name: "Bob", meta: { city: "LA", zip: 90001 } } };
    const rules = { "user.**": "mask" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.user.name, JSON.stringify(result)).toBe("***");
    expect(result.user.meta.city, JSON.stringify(result)).toBe("**");
    expect(result.user.meta.zip, JSON.stringify(result)).toBe("*****");
  });

  test("fallback to defaultMode", () => {
    // Arrange
    const input = { foo: "bar", baz: 42 };
    const rules = {};
    // Act
    const result = sanitize(input, { rules, defaultMode: "mask" });
    // Assert
    expect(result.foo).toMatch(/^\*+$/);
    expect(result.baz).toMatch(/^\*+$/);
  });

  test("random mode", () => {
    // Arrange
    const input = { n: 123, s: "abc", b: true, arr: [1, 2, 3] };
    const rules = { n: "random", s: "random", b: "random", arr: "random" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(typeof result.n).toBe("number");
    expect(typeof result.s).toBe("string");
    expect(typeof result.b).toBe("boolean");
    expect(Array.isArray(result.arr)).toBe(true);
  });

  test("preserve mode", () => {
    // Arrange
    const input = { a: 1, b: { c: 2 } };
    const rules = { a: "preserve", "b.c": "preserve" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result).toEqual(input);
  });

  test("mixed glob and exact", () => {
    // Arrange
    const input = { user: { email: "x@y.com", name: "Zed" }, email: "a@b.com" };
    const rules = { "user.email": "redact", email: "mask", "user.*": "mask" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.email).toMatch(/^\*+$/);
    expect(result.user.email).toBe("[REDACTED]");
    expect(result.user.name).toMatch(/^\*+$/);
  });

  test("custom redact and random strings", () => {
    // Arrange
    const input = { secret: "abc", foo: 123, bar: true };
    const rules = { secret: "redact", foo: "random", bar: "random" };
    // Act
    const result = sanitize(input, { rules, redactString: "<REMOVED>", randomString: "<RANDOM>" });
    // Assert
    expect(result.secret).toBe("<REMOVED>");
    expect(result.foo === "<RANDOM>" || typeof result.foo === "number").toBe(true);
    expect(result.bar === "<RANDOM>" || typeof result.bar === "boolean").toBe(true);
  });

  test("deep nested .** with mixed rules", () => {
    // Arrange
    const input = {
      user: {
        name: "Alice",
        meta: { city: "NY", zip: 12345 },
        contact: { email: "a@b.com", phone: "123" },
      },
      admin: { name: "Bob", meta: { city: "LA" } },
    };
    const rules = {
      "user.**": "redact",
      "user.meta.city": "mask",
      "admin.meta.city": "mask",
    };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.user).toBe("[REDACTED]");
    expect(result.admin.meta.city).toMatch(/^\*+$/);
    expect(result.admin.name).toBe("Bob");
  });

  test(".* glob only matches one level", () => {
    // Arrange
    const input = { a: { b: { c: 1 }, d: 2 }, x: 3 };
    const rules = { "a.*": "mask", x: "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.a.d).toMatch(/^\*+$/);
    expect(result.a.b).toEqual({ c: 1 });
    expect(result.x).toBe("[REDACTED]");
  });

  test("empty rules with defaultMode", () => {
    // Arrange
    const input = { foo: "bar", arr: [1, 2, 3], obj: { x: 1 } };
    // Act
    const result = sanitize(input, { rules: {}, defaultMode: "mask" });
    // Assert
    expect(result.foo).toMatch(/^\*+$/);
    expect(result.arr.every((v: any) => typeof v === "string" && /^\*+$/.test(v))).toBe(true);
    expect(result.obj.x).toMatch(/^\*+$/);
  });

  test("random mode for arrays", () => {
    // Arrange
    const input = { arr: [1, 2, 3], arr2: ["a", "b"] };
    const rules = { arr: "random", arr2: "random" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(Array.isArray(result.arr)).toBe(true);
    expect(result.arr.length).toBe(3);
    expect(result.arr2.length).toBe(2);
  });

  test("redact mode for arrays", () => {
    // Arrange
    const input = { arr: ["secret", "hidden"] };
    const rules = { arr: "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.arr).toBe("[REDACTED]");
  });

  test("preserve mode for arrays", () => {
    // Arrange
    const input = { arr: [1, 2, 3] };
    const rules = { arr: "preserve" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.arr).toEqual([1, 2, 3]);
  });

  test("empty input", () => {
    // Arrange/Act/Assert
    expect(sanitize(null, { rules: {} })).toBe(null);
    expect(sanitize(undefined, { rules: {} })).toBe(undefined);
    expect(sanitize({}, { rules: {} })).toEqual({});
    expect(sanitize([], { rules: {} })).toEqual([]);
  });

  test("custom randomGenerators for number, string, boolean", () => {
    // Arrange
    const input = { n: 1, s: "x", b: false };
    const rules = { n: "random", s: "random", b: "random" };
    const randomGenerators = {
      number: () => 42,
      string: () => "RANDOMIZED",
      boolean: () => false,
    };
    // Act
    const result = sanitize(input, { rules, randomGenerators });
    // Assert
    expect(result.n).toBe(42);
    expect(result.s).toBe("RANDOMIZED");
    expect(result.b).toBe(false);
  });

  test("custom randomGenerators for array and object", () => {
    // Arrange
    const input = { arr: [1, 2, 3], obj: { foo: "bar" } };
    const rules = { arr: "random", obj: "random" };
    const randomGenerators = {
      array: (arr: any[]) => arr.map(() => "ARR"),
      object: (obj: object) => ({ replaced: true }),
    };
    // Act
    const result = sanitize(input, { rules, randomGenerators });
    // Assert
    expect(result.arr).toEqual(["ARR", "ARR", "ARR"]);
    expect(result.obj).toEqual({ replaced: true });
  });

  test("randomGenerators fallback to default for missing types", () => {
    // Arrange
    const input = { n: 1, arr: [1, 2] };
    const rules = { n: "random", arr: "random" };
    const randomGenerators = {
      string: () => "STR",
    };
    // Act
    const result = sanitize(input, { rules, randomGenerators });
    // Assert
    expect(typeof result.n).toBe("number");
    expect(Array.isArray(result.arr)).toBe(true);
  });
});
