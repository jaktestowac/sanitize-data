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
});
