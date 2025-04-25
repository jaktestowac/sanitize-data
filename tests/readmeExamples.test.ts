import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("README examples", () => {
  test("main usage example", () => {
    // Example from README
    const input = {
      user: {
        email: "a@b.com",
        name: "Alice",
        meta: { city: "NY", zip: 12345 },
        contact: { phone: "123-456", address: "Main St" },
      },
      token: "secret",
      arr: [1, 2, 3],
      info: { score: 99 },
    };

    const rules: SanitizerRules = {
      "user.email": "redact", // redact only user.email
      "user.*": "mask", // mask all direct children of user
      "user.**": "redact", // redact all nested keys under user (overrides above for deeper fields)
      token: "redact", // redact token at any level
      arr: "random", // randomize array values
      score: "random", // randomize any key named "score" at any level
    };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    // Check each value matches what the README says to expect
    expect(result.user.email).toBe("[REDACTED]");
    expect(result.user.name).toMatch(/^\*+$/);
    expect(result.user.meta).toEqual({
      city: "[REDACTED]",
      zip: "[REDACTED]",
    });
    expect(result.user.contact).toEqual({
      address: "[REDACTED]",
      phone: "[REDACTED]",
    });
    expect(result.token).toBe("[REDACTED]");

    // Random arrays should be different and contain numbers
    expect(Array.isArray(result.arr)).toBe(true);
    expect(result.arr).toHaveLength(3);
    expect(typeof result.arr[0]).toBe("number");
    expect(result.arr).not.toEqual([1, 2, 3]);

    // score field should be randomized
    expect(typeof result.info.score).toBe("number");
    expect(result.info.score).not.toBe(99);
  });

  test("custom random generators example", () => {
    // Example from README
    const input = {
      password: "abc",
      age: 30,
      user: { name: "Alice", surname: "Smith", token: "tok1" },
      meta: { score: 100, token: "tok2" },
      token: "tok3",
    };

    const rules: SanitizerRules = {
      password: "random",
      age: "random",
      "user.name": "random",
      "meta.score": "random",
      "*.token": "random",
    };

    const randomGenerators = {
      number: () => Math.floor(Math.random() * 1000), // random number
      string: () => Math.random().toString(36).slice(2, 10), // random string
      boolean: () => Math.random() > 0.5, // random boolean
      array: (arr: any[]) => arr.map(() => "ARR"), // all array elements replaced with "ARR"
      object: (obj: object) => ({ replaced: true }), // replace object with a fixed value
    };

    const randomFieldGenerators = {
      password: () => "XXX",
      "**.name": () => "ANON",
      "user.surname": () => "SURNAME",
      "meta.score": () => "SCORE",
      "**.token": () => "ANY_TOKEN",
    };

    // Act
    const result = sanitize(input, {
      rules,
      randomGenerators,
      randomFieldGenerators,
    });

    // Assert
    expect(result.password).toBe("XXX");
    expect(typeof result.age).toBe("number");
    expect(result.user.name).toBe("ANON");
    expect(result.user.surname).toBe("SURNAME");
    expect(result.user.token).toBe("ANY_TOKEN");
    expect(result.meta.score).toBe("SCORE");
    expect(result.meta.token).toBe("ANY_TOKEN");
    expect(result.token).toBe("ANY_TOKEN");
  });

  test("field generators without rules", () => {
    // Example from README
    const input = {
      company: {
        departments: [{ name: "Engineering" }, { name: "Marketing" }],
      },
    };

    // No rules (defaultMode: "preserve"), but field generators still apply
    const randomFieldGenerators = {
      "**.name": (val: string) => `Anonymous-${val}`,
    };

    // Act
    const result = sanitize(input, { randomFieldGenerators });

    // Assert
    expect(result.company.departments[0].name).toBe("Anonymous-Engineering");
    expect(result.company.departments[1].name).toBe("Anonymous-Marketing");
  });

  test("bracket notation example", () => {
    // Example from README
    const input = {
      products: [
        {
          name: "Product1",
          variants: [
            { color: "red", size: "S" },
            { color: "blue", size: "M" },
          ],
        },
        { name: "Product2", variants: [{ color: "green", size: "L" }] },
      ],
    };

    const rules: SanitizerRules = {
      "products[*].variants[*].color": "random",
    };

    const randomFieldGenerators = {
      "products[*].variants[*].color": () => "randomized-color",
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.products[0].variants[0].color).toBe("randomized-color");
    expect(result.products[0].variants[1].color).toBe("randomized-color");
    expect(result.products[1].variants[0].color).toBe("randomized-color");
    expect(result.products[0].name).toBe("Product1"); // Should be preserved
    expect(result.products[0].variants[0].size).toBe("S"); // Should be preserved
  });

  test("mask all fields except a few", () => {
    // Example from README
    const input = { a: 1, b: 2, c: 3 };
    const rules = { a: "preserve" };

    // Act
    const result = sanitize(input, { rules, defaultMode: "mask" });

    // Assert
    expect(result.a).toBe(1);
    expect(result.b).toMatch(/^\*+$/);
    expect(result.c).toMatch(/^\*+$/);
  });

  test("redact all nested fields under a key", () => {
    // Example from README
    const input = { user: { name: "Alice", meta: { city: "NY" } }, admin: { name: "Bob" } };
    const rules = { "user.**": "redact" };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    // README shows user as a completely redacted object
    expect(result.user).toEqual({
      meta: "[REDACTED]",
      name: "[REDACTED]",
    });
    expect(result.admin.name).toBe("Bob"); // Should be preserved
  });

  test("use custom random string for all randoms", () => {
    // Example from README
    const input = { foo: "bar", arr: [1, 2, 3] };
    const rules = { foo: "random", arr: "random" };

    // Act
    const result = sanitize(input, { rules, randomString: "<RANDOM>" });

    // Assert
    // For non-primitives or unknown types, it should use the custom random string
    expect(typeof result.foo).toBe("string");

    // Arrays should be randomized
    expect(Array.isArray(result.arr)).toBe(true);
    expect(result.arr).toHaveLength(3);

    // With a custom randomString, we need to check the random values are either
    // numbers or the custom string
    result.arr.forEach((item: any) => {
      const isNumber = typeof item === "number";
      const isCustomString = item === "<RANDOM>";
      expect(isNumber || isCustomString).toBeTruthy();
    });
  });
});
