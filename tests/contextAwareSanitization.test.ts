import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("contextAwareSanitization", () => {
  test("context-aware sanitization with path information", () => {
    // Arrange
    const input = {
      users: [
        {
          id: 1,
          email: "user1@example.com",
          phone: "123-456-7890",
          ssn: "123-45-6789",
        },
        {
          id: 2,
          email: "user2@example.com",
          phone: "987-654-3210",
          ssn: "987-65-4321",
        },
      ],
    };

    const rules: SanitizerRules = {
      email: "random",
      phone: "random",
      ssn: "random",
    };

    const randomFieldGenerators = {
      email: (value: string) => {
        const parts = value.split("@");
        return `${parts[0][0]}*****@${parts[1]}`;
      },
      phone: (value: string) => {
        // Keep area code, mask the rest
        return value.replace(/^(\d{3})-(\d{3})-(\d{4})$/, "$1-***-****");
      },
      ssn: () => "XXX-XX-XXXX", // Complete replacement
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.users[0].email).toBe("u*****@example.com");
    expect(result.users[0].phone).toBe("123-***-****");
    expect(result.users[0].ssn).toBe("XXX-XX-XXXX");
    expect(result.users[1].email).toBe("u*****@example.com");
    expect(result.users[1].phone).toBe("987-***-****");
    expect(result.users[1].ssn).toBe("XXX-XX-XXXX");
  });

  test("field sanitization based on data type and value characteristics", () => {
    // Arrange
    const input = {
      records: [
        { id: 1, value: "short" },
        { id: 2, value: "medium length text" },
        { id: 3, value: "this is a much longer text that needs different handling" },
        { id: 4, value: 42 },
        { id: 5, value: true },
        { id: 6, value: null },
        { id: 7, value: [] },
      ],
    };

    const rules: SanitizerRules = {
      "records.*.value": "random",
    };

    const randomFieldGenerators = {
      "records.*.value": (value: any) => {
        // Different sanitization based on type and content
        if (value === null || value === undefined) return "[NULL]";
        if (typeof value === "boolean") return !value; // Flip boolean
        if (typeof value === "number") return value * 10; // Multiply by 10
        if (Array.isArray(value)) return ["sanitized"];

        // For strings, different treatment based on length
        if (typeof value === "string") {
          if (value.length <= 5) return value.toUpperCase();
          if (value.length <= 20) return value.substring(0, 3) + "...";
          return "Long text removed";
        }

        return "[UNKNOWN]";
      },
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.records[0].value).toBe("SHORT");
    expect(result.records[1].value).toBe("med...");
    expect(result.records[2].value).toBe("Long text removed");
    expect(result.records[3].value).toBe(420);
    expect(result.records[4].value).toBe(false);
    expect(result.records[5].value).toBe("[NULL]");
    expect(result.records[6].value).toEqual(["sanitized"]);
  });

  test("sanitization based on relative field values", () => {
    // Arrange
    const input = {
      products: [
        { id: "p1", price: 10, onSale: true },
        { id: "p2", price: 20, onSale: false },
        { id: "p3", price: 30, onSale: true },
      ],
    };

    // Remember the original values for randomization
    const originalProducts = JSON.parse(JSON.stringify(input.products));

    const rules: SanitizerRules = {
      "products.*.price": "random",
    };

    const randomFieldGenerators = {
      "products.*.price": (value: number, path: string) => {
        // Extract product index to find related fields
        const pathParts = path.split(".");
        const productIndex = parseInt(pathParts[1]);

        // Get the onSale status from the original data
        const isOnSale = originalProducts[productIndex].onSale;

        // Apply different pricing logic based on sale status
        return isOnSale ? value * 0.8 : value * 1.2; // 20% discount or 20% markup
      },
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.products[0].price).toBe(8); // 10 * 0.8 = 8 (on sale)
    expect(result.products[1].price).toBe(24); // 20 * 1.2 = 24 (not on sale)
    expect(result.products[2].price).toBe(24); // 30 * 0.8 = 24 (on sale)
  });

  test("selective field sanitization based on content", () => {
    // Arrange
    const input = {
      messages: [
        { text: "Hello world", containsPII: false },
        { text: "My SSN is 123-45-6789", containsPII: true },
        { text: "My credit card is 4111-1111-1111-1111", containsPII: true },
        { text: "Just some random text", containsPII: false },
      ],
    };

    const rules: SanitizerRules = {
      "messages.*.text": "random",
    };

    const randomFieldGenerators = {
      "messages.*.text": (value: string, path: string) => {
        // Extract message index
        const pathParts = path.split(".");
        const messageIndex = parseInt(pathParts[1]);

        // Check if message contains PII
        const containsPII = input.messages[messageIndex].containsPII;

        // Only sanitize messages that contain PII
        if (!containsPII) return value;

        // Sanitize SSN and credit card patterns
        return value
          .replace(/\d{3}-\d{2}-\d{4}/g, "XXX-XX-XXXX")
          .replace(/\d{4}-\d{4}-\d{4}-\d{4}/g, "XXXX-XXXX-XXXX-XXXX");
      },
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.messages[0].text).toBe("Hello world");
    expect(result.messages[1].text).toBe("My SSN is XXX-XX-XXXX");
    expect(result.messages[2].text).toBe("My credit card is XXXX-XXXX-XXXX-XXXX");
    expect(result.messages[3].text).toBe("Just some random text");
  });

  test("preserving relationships between sanitized fields", () => {
    // Arrange
    const input = {
      accounts: [
        {
          id: "a1",
          primaryEmail: "user1@example.com",
          backupEmail: "user1-backup@example.com",
          recoveryEmail: "user1-recovery@example.com",
        },
        {
          id: "a2",
          primaryEmail: "user2@example.com",
          backupEmail: "different@example.com",
          recoveryEmail: "another@example.com",
        },
      ],
    };

    const rules: SanitizerRules = {
      "**.email": "random",
    };

    // Track sanitized values to maintain consistency
    const emailMap = new Map();

    const randomFieldGenerators = {
      "**.email": (value: string) => {
        // If we've already sanitized this email, return the same value
        if (emailMap.has(value)) {
          return emailMap.get(value);
        }

        // Otherwise, generate new sanitized value
        const [local, domain] = value.split("@");
        const sanitized = `${local[0]}***@${domain}`;

        // Store for future reference
        emailMap.set(value, sanitized);

        return sanitized;
      },
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    const user1Primary = result.accounts[0].primaryEmail;
    const user1Backup = result.accounts[0].backupEmail;
    const user1Recovery = result.accounts[0].recoveryEmail;

    // Different base emails should get different sanitized values
    expect(user1Primary).not.toBe(user1Backup);
    expect(user1Primary).not.toBe(user1Recovery);

    // user2 uses completely different email addresses
    expect(result.accounts[1].primaryEmail).not.toBe(user1Primary);
  });

  test("contextual sanitization using parent and child relationships", () => {
    // Arrange
    const input = {
      company: {
        name: "Acme Corp",
        departments: [
          {
            name: "HR",
            employees: [
              { id: 1, name: "Alice", salary: 70000 },
              { id: 2, name: "Bob", salary: 75000 },
            ],
          },
          {
            name: "Engineering",
            employees: [
              { id: 3, name: "Charlie", salary: 90000 },
              { id: 4, name: "Dave", salary: 95000 },
            ],
          },
        ],
      },
    };

    // Create a department-specific sanitization approach
    const randomFieldGenerators = {
      "**.salary": (value: number, path: string) => {
        if (value < 75000) return "60K-75K";
        if (value < 90000) return "75K-85K";
        return "85K+";
      },
    };

    // Act
    const result = sanitize(input, { randomFieldGenerators });

    // Assert
    // HR department
    expect(result.company.departments[0].employees[0].salary).toBe("60K-75K");
    expect(result.company.departments[0].employees[0].name).toBe("Alice");
    expect(result.company.departments[0].employees[1].salary).toBe("75K-85K");
    expect(result.company.departments[0].employees[1].name).toBe("Bob");

    // Engineering department
    expect(result.company.departments[1].employees[0].salary).toBe("85K+");
    expect(result.company.departments[1].employees[0].name).toBe("Charlie");
    expect(result.company.departments[1].employees[1].salary).toBe("85K+");
    expect(result.company.departments[1].employees[1].name).toBe("Dave");
  });
});
