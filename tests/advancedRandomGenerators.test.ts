import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("advancedRandomGenerators", () => {
  test("wildcard bracket notation for randomFieldGenerators", () => {
    // Arrange
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
  });

  test("mixed **/* wildcards in field generators", () => {
    // Arrange
    const input = {
      company: {
        departments: [
          {
            name: "Engineering",
            teams: [
              {
                name: "Frontend",
                members: [
                  { name: "Alice", id: "fe1" },
                  { name: "Bob", id: "fe2" },
                ],
              },
              { name: "Backend", members: [{ name: "Charlie", id: "be1" }] },
            ],
          },
          {
            name: "Marketing",
            teams: [{ name: "Digital", members: [{ name: "Dave", id: "dm1" }] }],
          },
        ],
      },
    };

    const rules: SanitizerRules = {};

    const randomFieldGenerators = {
      "**.name": (val) => `Anonymous-${val}`,
      "**.id": () => "xxxx",
      "company.departments.*.teams.*.name": (val) => `Team-${val}`,
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    // Department names
    expect(result.company.departments[0].name).toBe("Anonymous-Engineering");
    expect(result.company.departments[1].name).toBe("Anonymous-Marketing");

    // Team names - should use the more specific generator
    expect(result.company.departments[0].teams[0].name).toBe("Team-Frontend");
    expect(result.company.departments[0].teams[1].name).toBe("Team-Backend");

    // Member names - should use the more general ** pattern
    expect(result.company.departments[0].teams[0].members[0].name).toBe("Anonymous-Alice");
    expect(result.company.departments[0].teams[0].members[0].id).toBe("xxxx");
  });

  test("*.field notation matches at root level", () => {
    // Arrange
    const input = {
      score: 100,
      user: { score: 85 },
      admin: { score: 90 },
    };

    const rules: SanitizerRules = {
      "*.score": "random",
    };

    const randomFieldGenerators = {
      "*.score": () => 999,
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.score).toBe(999); // Root level should match
    expect(result.user.score).toBe(85);
    expect(result.admin.score).toBe(90);
  });

  test("nested wildcards with bracket notation", () => {
    // Arrange
    const input = {
      categories: [
        {
          name: "Category1",
          products: [
            {
              id: "p1",
              variants: [
                { color: "red", size: "S" },
                { color: "blue", size: "M" },
              ],
            },
            { id: "p2", variants: [{ color: "green", size: "L" }] },
          ],
        },
        {
          name: "Category2",
          products: [{ id: "p3", variants: [{ color: "black", size: "XL" }] }],
        },
      ],
    };

    const rules: SanitizerRules = {
      "categories[*].products[*].variants[*].color": "random",
    };

    const randomFieldGenerators = {
      "categories[*].products[*].variants[*].color": () => "custom-color",
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.categories[0].products[0].variants[0].color).toBe("custom-color");
    expect(result.categories[0].products[0].variants[1].color).toBe("custom-color");
    expect(result.categories[0].products[1].variants[0].color).toBe("custom-color");
    expect(result.categories[1].products[0].variants[0].color).toBe("custom-color");
  });

  test("combined ** and bracket notation", () => {
    // Arrange
    const input = {
      store: {
        departments: [
          {
            name: "Electronics",
            items: [
              { id: 1, specs: { color: "black", weight: "2kg" } },
              { id: 2, specs: { color: "white", weight: "1kg" } },
            ],
          },
          {
            name: "Clothing",
            items: [{ id: 3, specs: { color: "blue", material: "cotton" } }],
          },
        ],
      },
    };

    const rules: SanitizerRules = {
      "store.**.items[*].specs.color": "random",
    };

    const randomFieldGenerators = {
      "store.**.items[*].specs.color": () => "anonymized-color",
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.store.departments[0].items[0].specs.color).toBe("anonymized-color");
    expect(result.store.departments[0].items[1].specs.color).toBe("anonymized-color");
    expect(result.store.departments[1].items[0].specs.color).toBe("anonymized-color");
    expect(result.store.departments[0].items[0].specs.weight).toBe("2kg"); // Should remain unchanged
  });

  test("mixed array and object access patterns", () => {
    // Arrange
    const input = {
      users: [
        {
          profile: {
            firstName: "John",
            lastName: "Doe",
            contacts: [
              { type: "email", value: "john@example.com" },
              { type: "phone", value: "123-456-7890" },
            ],
          },
        },
        {
          profile: {
            firstName: "Jane",
            lastName: "Smith",
            contacts: [{ type: "email", value: "jane@example.com" }],
          },
        },
      ],
    };

    const rules: SanitizerRules = {
      "users[*].profile.contacts[*].value": "random",
    };

    const randomFieldGenerators = {
      "users[*].profile.contacts[*].value": (val, path) => {
        if (val.includes("@")) {
          return "masked@example.com";
        } else {
          return "xxx-xxx-xxxx";
        }
      },
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert - for simplicity, we'll test a specific path rather than using the type check from the generator
    expect(result.users[0].profile.contacts[0].value).toBe("masked@example.com");
    expect(result.users[0].profile.contacts[1].value).toBe("xxx-xxx-xxxx");
    expect(result.users[1].profile.contacts[0].value).toBe("masked@example.com");

    // Names should remain unchanged
    expect(result.users[0].profile.firstName).toBe("John");
    expect(result.users[1].profile.lastName).toBe("Smith");
  });

  test("multiple bracket patterns with different depths", () => {
    // Arrange
    const input = {
      companies: [
        {
          id: "company1",
          projects: [
            {
              id: "project1",
              tasks: [
                { id: "task1", assignee: "user1", priority: "high" },
                { id: "task2", assignee: "user2", priority: "medium" },
              ],
            },
            {
              id: "project2",
              tasks: [{ id: "task3", assignee: "user3", priority: "low" }],
            },
          ],
        },
        {
          id: "company2",
          projects: [],
        },
      ],
    };

    const rules: SanitizerRules = {
      "companies[*].projects[*].tasks[*].assignee": "mask",
      "companies[*].projects[*].tasks[*].priority": "random",
    };

    const randomFieldGenerators = {
      "companies[*].projects[*].tasks[*].priority": () => "normalized",
    };

    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });

    // Assert
    expect(result.companies[0].projects[0].tasks[0].assignee).toMatch(/^\*+$/);
    expect(result.companies[0].projects[0].tasks[1].assignee).toMatch(/^\*+$/);
    expect(result.companies[0].projects[1].tasks[0].assignee).toMatch(/^\*+$/);

    expect(result.companies[0].projects[0].tasks[0].priority).toBe("normalized");
    expect(result.companies[0].projects[0].tasks[1].priority).toBe("normalized");
    expect(result.companies[0].projects[1].tasks[0].priority).toBe("normalized");

    // IDs should be preserved
    expect(result.companies[0].id).toBe("company1");
    expect(result.companies[0].projects[0].id).toBe("project1");
    expect(result.companies[0].projects[0].tasks[0].id).toBe("task1");
  });
});
