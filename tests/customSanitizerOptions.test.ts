import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("customSanitizerOptions", () => {
  test("multiple custom randomGenerators with different priorities", () => {
    // Arrange
    const input = {
      user: {
        name: "Alice",
        email: "alice@example.com",
        age: 30,
        isActive: true,
        scores: [85, 90, 95],
      },
    };

    const rules: SanitizerRules = {
      "user.name": "random",
      "user.email": "random",
      "user.age": "random",
      "user.isActive": "random",
      "user.scores": "random",
    };

    const randomGenerators = {
      string: () => "DEFAULT_STRING",
      number: () => 100,
      boolean: () => false,
      array: () => [1, 1, 1],
    };

    const randomFieldGenerators = {
      // More specific patterns should override the defaults
      "user.name": () => "SPECIFIC_NAME",
      "user.scores": () => [10, 20, 30],
    };

    // Act
    const result = sanitize(input, { rules, randomGenerators, randomFieldGenerators });

    // Assert
    expect(result.user.name).toBe("SPECIFIC_NAME");
    expect(result.user.email).toBe("DEFAULT_STRING");
    expect(result.user.age).toBe(100);
    expect(result.user.isActive).toBe(false);
    expect(result.user.scores).toEqual([10, 20, 30]);
  });

  test("customizing all string values", () => {
    // Arrange
    const input = {
      redacted: "should be redacted",
      masked: "should be masked",
      random: "should be random",
    };

    const rules: SanitizerRules = {
      redacted: "redact",
      masked: "mask",
      random: "random",
    };

    // Act
    const result = sanitize(input, {
      rules,
      redactString: "<<REMOVED>>",
      randomString: "<<RANDOM>>",
      randomGenerators: {
        string: () => "<<CUSTOM_RANDOM>>",
      },
    });

    // Assert
    expect(result.redacted).toBe("<<REMOVED>>");
    expect(result.masked).toMatch(/^\*+$/); // Mask uses * characters
    expect(result.random).toBe("<<CUSTOM_RANDOM>>"); // Uses the string generator
  });

  test("combining randomFieldGenerators with original values", () => {
    // Arrange
    const input = {
      users: [
        { id: 1, name: "Alice", email: "alice@example.com" },
        { id: 2, name: "Bob", email: "bob@example.com" },
      ],
    };

    const rules: SanitizerRules = {
      "users.*.email": "random",
      "users.*.name": "random",
    };

    // Generators that use the original values
    const randomFieldGenerators = {
      "users.*.email": (value: string) => {
        const parts = value.split("@");
        return `${parts[0].charAt(0)}********@${parts[1]}`;
      },
      "users.*.name": (value: string) => {
        return value.charAt(0) + "****";
      },
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.users[0].email).toBe("a********@example.com");
    expect(result.users[1].email).toBe("b********@example.com");
    expect(result.users[0].name).toBe("A****");
    expect(result.users[1].name).toBe("B****");
  });
});
