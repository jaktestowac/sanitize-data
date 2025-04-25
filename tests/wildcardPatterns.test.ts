import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("wildcardPatterns", () => {
  test("complex wildcard combinations", () => {
    // Arrange
    const input = {
      users: [
        {
          profile: { name: "Alice", contact: { email: "alice@ex.com", phone: "123" } },
          scores: [85, 90, 95],
        },
        {
          profile: { name: "Bob", contact: { email: "bob@ex.com", phone: "456" } },
          scores: [70, 75, 80],
        },
      ],
    };

    const rules: SanitizerRules = {
      "users[*].profile.contact.*": "mask", // mask all contact fields
      "users.*.scores[*]": "random", // randomize all scores
      "users[*].*.name": "redact", // redact all name fields
    };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    expect(result.users[0].profile.name).toBe("[REDACTED]");
    expect(result.users[1].profile.name).toBe("[REDACTED]");
    expect(result.users[0].profile.contact.email).toMatch(/^\*+$/);
    expect(result.users[0].profile.contact.phone).toMatch(/^\*+$/);
    expect(result.users[1].profile.contact.email).toMatch(/^\*+$/);
    expect(typeof result.users[0].scores[0]).toBe("number");
    expect(typeof result.users[1].scores[2]).toBe("number");
  });

  test("competing wildcard patterns with mixed specificity", () => {
    // Arrange
    const input = {
      data: {
        user: { email: "user@ex.com", id: "123" },
        admin: { email: "admin@ex.com", id: "456" },
      },
    };

    const rules: SanitizerRules = {
      "data.*.email": "mask",
      "data.user.*": "redact",
      "data.**": "random", // least specific
    };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    // data.user.email should be redacted, not masked (more specific rule wins)
    expect(result.data.user.email).toBe("********");
    expect(result.data.user.id).toBe("[REDACTED]");

    // data.admin.email should be masked
    expect(result.data.admin.email).toMatch(/^\*+$/);

    // data.admin.id should be randomized (fallback to most general rule)
    expect(typeof result.data.admin.id).toBe("string");
    expect(result.data.admin.id).not.toBe("456");
  });

  test("wildcard at root level", () => {
    // Arrange
    const input = {
      name: "root",
      level1: {
        name: "mid",
        level2: { name: "deep" },
      },
    };

    const rules: SanitizerRules = {
      "*.name": "redact", // should match name at root
    };

    // Act
    const result = sanitize(input, { rules });

    // Assert
    expect(result.name).toBe("[REDACTED]");
    expect(result.level1.name).toBe("mid");
    expect(result.level1.level2.name).toBe("deep");
  });
});
