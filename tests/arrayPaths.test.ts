import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("arrayPaths", () => {
  test("exact array index with bracket notation", () => {
    // Arrange
    const input = { users: ["Alice", "Bob", "Charlie"] };
    const rules: SanitizerRules = { "users[1]": "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.users[0]).toBe("Alice");
    expect(result.users[1]).toBe("[REDACTED]");
    expect(result.users[2]).toBe("Charlie");
  });

  test("nested array index with bracket notation", () => {
    // Arrange
    const input = {
      teams: [
        { name: "Red", members: ["Alice", "Bob"] },
        { name: "Blue", members: ["Charlie", "Dave"] },
      ],
    };
    const rules: SanitizerRules = {
      "teams[0].members[1]": "redact",
      "teams[1].name": "mask",
    };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.teams[0].members[0]).toBe("Alice");
    expect(result.teams[0].members[1]).toBe("[REDACTED]");
    expect(result.teams[1].name).toMatch(/^\*+$/);
    expect(result.teams[1].members[0]).toBe("Charlie");
  });

  test("array index with wildcard", () => {
    // Arrange
    const input = {
      users: [
        { name: "Alice", email: "alice@example.com" },
        { name: "Bob", email: "bob@example.com" },
      ],
    };
    const rules: SanitizerRules = { "users[*].email": "mask" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.users[0].name).toBe("Alice");
    expect(result.users[0].email).toMatch(/^\*+$/); // Fix: expect the email to be masked
    expect(result.users[1].name).toBe("Bob");
    expect(result.users[1].email).toMatch(/^\*+$/); // Fix: expect the email to be masked
  });

  test("array index with bracket notation in randomFieldGenerators", () => {
    // Arrange
    const input = { users: [{ name: "Alice" }, { name: "Bob" }] };
    const rules: SanitizerRules = { "users[0].name": "random", "users[1].name": "random" };
    const randomFieldGenerators = {
      "users[0].name": () => "FIRST_USER",
      "users[1].name": () => "SECOND_USER",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].name).toBe("FIRST_USER");
    expect(result.users[1].name).toBe("SECOND_USER");
  });

  test("mixed bracket and dot notation for array indices", () => {
    // Arrange
    const input = { users: [{ name: "Alice" }, { name: "Bob" }] };
    const rules: SanitizerRules = { "users.0.name": "random", "users[1].name": "random" };
    const randomFieldGenerators = {
      "users.0.name": () => "DOT_NOTATION",
      "users[1].name": () => "BRACKET_NOTATION",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].name).toBe("DOT_NOTATION");
    expect(result.users[1].name).toBe("BRACKET_NOTATION");
  });

  test("deep nested arrays with bracket notation", () => {
    // Arrange
    const input = {
      categories: [
        {
          name: "Electronics",
          products: [
            { name: "Phone", variants: [{ color: "Red" }, { color: "Blue" }] },
            { name: "Laptop", variants: [{ color: "Silver" }, { color: "Black" }] },
          ],
        },
      ],
    };
    const rules: SanitizerRules = {
      "categories[0].products[0].variants[1].color": "mask",
      "categories[0].products[1].variants[0].color": "redact",
    };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.categories[0].products[0].variants[0].color).toBe("Red");
    expect(result.categories[0].products[0].variants[1].color).toMatch(/^\*+$/);
    expect(result.categories[0].products[1].variants[0].color).toBe("[REDACTED]");
    expect(result.categories[0].products[1].variants[1].color).toBe("Black");
  });

  test("wildcard paths with arrays using dot and bracket notations", () => {
    // Arrange
    const input = {
      users: [
        { name: "Alice", contact: { email: "alice@example.com" } },
        { name: "Bob", contact: { email: "bob@example.com" } },
      ],
    };
    const rules: SanitizerRules = {
      "users.*.contact.email": "random", // dot notation for wildcard
      "users[*].name": "mask", // bracket notation for wildcard
    };
    const randomFieldGenerators = {
      "users.*.contact.email": () => "random@example.com",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].name).toMatch(/^\*+$/); // Fix: expect name to be masked
    expect(result.users[1].name).toMatch(/^\*+$/); // Fix: expect name to be masked
    expect(result.users[0].contact.email).toBe("random@example.com");
    expect(result.users[1].contact.email).toBe("random@example.com");
  });

  test("simple array index with bracket notation", () => {
    // Arrange
    const input = { users: ["Alice", "Bob", "Charlie"] };
    const rules: SanitizerRules = { "users[1]": "redact" };
    // Act
    const result = sanitize(input, { rules });
    // Assert
    expect(result.users[0]).toBe("Alice");
    expect(result.users[1]).toBe("[REDACTED]");
    expect(result.users[2]).toBe("Charlie");
  });
});
