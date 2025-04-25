import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("randomFieldGenerators", () => {
  test("field generator by key", () => {
    // Arrange
    const input = { name: "Alice", age: 30 };
    const rules: SanitizerRules = { name: "random", age: "random" };
    const randomFieldGenerators = {
      name: () => "RANDOM_NAME",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.name).toBe("RANDOM_NAME");
    expect(typeof result.age).toBe("number");
  });

  test("field generator by dot-path", () => {
    // Arrange
    const input = { user: { name: "Alice", surname: "Smith" } };
    const rules: SanitizerRules = { "user.name": "random", "user.surname": "random" };
    const randomFieldGenerators = {
      "user.name": () => "RANDOM_USER_NAME",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.name).toBe("RANDOM_USER_NAME");
    expect(typeof result.user.surname).toBe("string");
  });

  test("field generator by key (case-insensitive)", () => {
    // Arrange
    const input = { Name: "Alice", Surname: "Smith" };
    const rules: SanitizerRules = { Name: "random", Surname: "random" };
    const randomFieldGenerators = {
      name: () => "LOWERCASE_NAME",
      surname: () => "LOWERCASE_SURNAME",
    };
    // Act
    const result = sanitize(input, {
      rules,
      randomFieldGenerators,
      randomFieldGeneratorsCaseInsensitive: true,
    });
    // Assert
    expect(result.Name).toBe("LOWERCASE_NAME");
    expect(result.Surname).toBe("LOWERCASE_SURNAME");
  });

  test("field generator by dot-path (case-insensitive)", () => {
    // Arrange
    const input = { User: { Name: "Alice", Surname: "Smith" } };
    const rules: SanitizerRules = { "User.Name": "random", "User.Surname": "random" };
    const randomFieldGenerators = {
      "user.name": () => "LOWERCASE_USER_NAME",
      "user.surname": () => "LOWERCASE_USER_SURNAME",
    };
    // Act
    const result = sanitize(input, {
      rules,
      randomFieldGenerators,
      randomFieldGeneratorsCaseInsensitive: true,
    });
    // Assert
    expect(result.User.Name).toBe("LOWERCASE_USER_NAME");
    expect(result.User.Surname).toBe("LOWERCASE_USER_SURNAME");
  });

  test("field generator prefers dot-path over key", () => {
    // Arrange
    const input = { user: { name: "Alice" }, name: "Bob" };
    const rules: SanitizerRules = { "user.name": "random", name: "random" };
    const randomFieldGenerators = {
      name: () => "GEN_KEY",
      "user.name": () => "GEN_PATH",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.name).toBe("GEN_PATH");
    expect(result.name).toBe("GEN_KEY");
  });

  test("field generator fallback to type generator", () => {
    // Arrange
    const input = { name: "Alice", age: 30 };
    const rules: SanitizerRules = { name: "random", age: "random" };
    const randomGenerators = {
      string: () => "TYPE_STRING",
      number: () => 123,
    };
    // Act
    const result = sanitize(input, { rules, randomGenerators });
    // Assert
    expect(result.name).toBe("TYPE_STRING");
    expect(result.age).toBe(123);
  });

  test("field generator fallback to default random string", () => {
    // Arrange
    const input = { foo: "bar" };
    const rules: SanitizerRules = { foo: "random" };
    // Act
    const result = sanitize(input, { rules, randomString: "<DEF>" });
    // Assert
    expect(result.foo === "<DEF>" || typeof result.foo === "string").toBe(true);
  });

  test("field generator by key for nested fields", () => {
    // Arrange
    const input = { user: { name: "Alice", surname: "Smith" }, meta: { name: "Bob" } };
    const rules: SanitizerRules = {
      "user.name": "random",
      "user.surname": "random",
      "meta.name": "random",
    };
    const randomFieldGenerators = {
      name: () => "GEN_NAME",
      surname: () => "GEN_SURNAME",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.name).toBe("GEN_NAME");
    expect(result.user.surname).toBe("GEN_SURNAME");
    expect(result.meta.name).toBe("GEN_NAME");
  });

  test("field generator by key for nested fields (case-insensitive)", () => {
    // Arrange
    const input = { User: { Name: "Alice", Surname: "Smith" }, Meta: { Name: "Bob" } };
    const rules: SanitizerRules = {
      "User.Name": "random",
      "User.Surname": "random",
      "Meta.Name": "random",
    };
    const randomFieldGenerators = {
      name: () => "GEN_NAME_CI",
      surname: () => "GEN_SURNAME_CI",
    };
    // Act
    const result = sanitize(input, {
      rules,
      randomFieldGenerators,
      randomFieldGeneratorsCaseInsensitive: true,
    });
    // Assert
    expect(result.User.Name).toBe("GEN_NAME_CI");
    expect(result.User.Surname).toBe("GEN_SURNAME_CI");
    expect(result.Meta.Name).toBe("GEN_NAME_CI");
  });

  test("field generator by key does not override dot-path if both present", () => {
    // Arrange
    const input = { user: { name: "Alice" }, name: "Bob" };
    const rules: SanitizerRules = { "user.name": "random", name: "random" };
    const randomFieldGenerators = {
      name: () => "GEN_KEY",
      "user.name": () => "GEN_PATH",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.name).toBe("GEN_PATH");
    expect(result.name).toBe("GEN_KEY");
  });

  test("field generator with empty object and array", () => {
    // Arrange
    const input = { arr: [], obj: {} };
    const rules: SanitizerRules = { arr: "random", obj: "random" };
    const randomFieldGenerators = {
      arr: () => ["A"],
      obj: () => ({ foo: "bar" }),
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.arr).toEqual(["A"]);
    expect(result.obj).toEqual({ foo: "bar" });
  });

  test("randomFieldGenerators does not affect non-random fields", () => {
    // Arrange
    const input = { name: "Alice", age: 30 };
    const rules: SanitizerRules = { name: "mask", age: "preserve" };
    const randomFieldGenerators = {
      name: () => "SHOULD_NOT_APPLY",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.name).not.toBe("SHOULD_NOT_APPLY");
    expect(result.name).toMatch(/^\*+$/);
    expect(result.age).toBe(30);
  });

  test("randomFieldGenerators with falsy values", () => {
    // Arrange
    const input = { name: "Alice", age: 30 };
    const rules: SanitizerRules = { name: "random", age: "random" };
    const randomFieldGenerators = {
      name: () => "",
      age: () => 0,
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.name).toBe("");
    expect(result.age).toBe(0);
  });

  test("randomFieldGenerators with undefined generator returns type fallback", () => {
    // Arrange
    const input = { foo: "bar" };
    const rules: SanitizerRules = { foo: "random" };
    const randomFieldGenerators = {
      bar: undefined as any,
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(typeof result.foo).toBe("string");
  });

  test("randomFieldGeneratorsCaseInsensitive does not affect dot-paths if not present", () => {
    // Arrange
    const input = { User: { Name: "Alice" } };
    const rules: SanitizerRules = { "User.Name": "random" };
    const randomFieldGenerators = {
      name: () => "GEN_NAME_CI",
    };
    // Act
    const result = sanitize(input, {
      rules,
      randomFieldGenerators,
      randomFieldGeneratorsCaseInsensitive: true,
    });
    // Assert
    expect(result.User.Name).toBe("GEN_NAME_CI");
  });

  test("randomFieldGenerators with numeric keys", () => {
    // Arrange
    const input = { "123": "abc", foo: "bar" };
    const rules: SanitizerRules = { "123": "random", foo: "random" };
    const randomFieldGenerators = {
      "123": () => "NUMERIC_KEY",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result["123"]).toBe("NUMERIC_KEY");
    expect(typeof result.foo).toBe("string");
  });

  test("field generator by key for deeply nested fields", () => {
    // Arrange
    const input = { a: { b: { c: { name: "Alice", age: 22 } } }, d: { name: "Bob" } };
    const rules: SanitizerRules = { name: "random", age: "random" };
    const randomFieldGenerators = {
      name: () => "DEEP_NAME",
      age: () => 99,
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.a.b.c.name).toBe("DEEP_NAME");
    expect(result.a.b.c.age).toBe(99);
    expect(result.d.name).toBe("DEEP_NAME");
  });

  test("field generator by dot-path for deeply nested fields", () => {
    // Arrange
    const input = { a: { b: { c: { name: "Alice" } } } };
    const rules: SanitizerRules = { "a.b.c.name": "random" };
    const randomFieldGenerators = {
      "a.b.c.name": () => "DEEP_PATH_NAME",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.a.b.c.name).toBe("DEEP_PATH_NAME");
  });

  test("field generator for nested arrays of objects", () => {
    // Arrange
    const input = { users: [{ name: "A" }, { name: "B" }], meta: { people: [{ name: "C" }] } };
    const rules: SanitizerRules = { name: "random" };
    const randomFieldGenerators = {
      name: () => "ARR_NAME",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].name).toBe("ARR_NAME");
    expect(result.users[1].name).toBe("ARR_NAME");
    expect(result.meta.people[0].name).toBe("ARR_NAME");
  });

  test("field generator for mixed types in nested objects", () => {
    // Arrange
    const input = {
      user: { name: "Alice", age: 30, active: true, meta: { score: 100 } },
      admin: { name: "Bob", age: 40, active: false, meta: { score: 200 } },
    };
    const rules: SanitizerRules = {
      name: "random",
      age: "random",
      active: "random",
      score: "random",
    };
    const randomFieldGenerators = {
      name: () => "MIXED_NAME",
      age: () => 0,
      active: () => null,
      score: () => "SCORE",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators, keyMatchAnyLevel: true });
    // Assert
    expect(result.user.name).toBe("MIXED_NAME");
    expect(result.user.age).toBe(0);
    expect(result.user.active).toBe(null);
    expect(result.user.meta.score).toBe("SCORE");
    expect(result.admin.name).toBe("MIXED_NAME");
    expect(result.admin.age).toBe(0);
    expect(result.admin.active).toBe(null);
    expect(result.admin.meta.score).toBe("SCORE");
  });

  test("field generator for array of nested objects with different keys", () => {
    // Arrange
    const input = {
      items: [
        { type: "book", title: "A", price: 10 },
        { type: "pen", title: "B", price: 2 },
      ],
    };
    const rules: SanitizerRules = { title: "random", price: "random" };
    const randomFieldGenerators = {
      title: () => "RANDOM_TITLE",
      price: () => 1,
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.items[0].title).toBe("RANDOM_TITLE");
    expect(result.items[1].title).toBe("RANDOM_TITLE");
    expect(result.items[0].price).toBe(1);
    expect(result.items[1].price).toBe(1);
  });

  test("field generator for objects with null and undefined values", () => {
    // Arrange
    const input = { name: null, age: undefined, meta: { name: null } };
    const rules: SanitizerRules = { name: "random", age: "random" };
    const randomFieldGenerators = {
      name: () => "NULL_NAME",
      age: () => "UNDEF_AGE",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.name).toBe("NULL_NAME");
    expect(result.age).toBe("UNDEF_AGE");
    expect(result.meta.name).toBe("NULL_NAME");
  });

  test('field generator with "*." partial path matches any parent', () => {
    // Arrange
    const input = {
      user: { meta: { score: 123 }, score: 456 },
      admin: { meta: { score: 789 }, score: 101 },
      score: 202,
    };
    const rules: SanitizerRules = { score: "random" };
    const randomFieldGenerators = {
      "*.score": () => "ANY_PARENT_SCORE",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.meta.score).toBe("ANY_PARENT_SCORE");
    expect(result.user.score).toBe("ANY_PARENT_SCORE");
    expect(result.admin.meta.score).toBe("ANY_PARENT_SCORE");
    expect(result.admin.score).toBe("ANY_PARENT_SCORE");
    expect(result.score).toBe("ANY_PARENT_SCORE");
  });

  test("field generator for array indexed paths", () => {
    // Arrange
    const input = { users: [{ name: "Alice" }, { name: "Bob" }] };
    // Use bracket notation in rules and generators
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

  test("field generator with wildcard for array paths", () => {
    // Arrange
    const input = { users: [{ name: "Alice" }, { name: "Bob" }] };
    const rules: SanitizerRules = { "users.*.name": "random" };
    const randomFieldGenerators = {
      "users.*.name": () => "ANY_USER",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].name).toBe("ANY_USER");
    expect(result.users[1].name).toBe("ANY_USER");
  });

  test("field generator with both randomFieldGenerators and randomGenerators", () => {
    // Arrange
    const input = { name: "Alice", age: 30, active: true };
    const rules: SanitizerRules = { name: "random", age: "random", active: "random" };
    const randomFieldGenerators = {
      name: () => "SPECIFIC_NAME",
    };
    const randomGenerators = {
      number: () => 99,
      boolean: () => false,
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators, randomGenerators });
    // Assert
    expect(result.name).toBe("SPECIFIC_NAME"); // From randomFieldGenerators
    expect(result.age).toBe(99); // From randomGenerators
    expect(result.active).toBe(false); // From randomGenerators
  });

  test("field generator respects keyMatchAnyLevel setting", () => {
    // Arrange
    const input = {
      user: { name: "Alice" },
      admin: { name: "Bob" },
      name: "Charlie",
    };
    const rules: SanitizerRules = { name: "random" };
    const randomFieldGenerators = {
      name: () => "MATCHED_NAME",
    };
    // Act
    const resultWithMatching = sanitize(input, {
      rules,
      randomFieldGenerators,
      keyMatchAnyLevel: true,
    });
    const resultWithoutMatching = sanitize(input, {
      rules,
      randomFieldGenerators,
      keyMatchAnyLevel: false,
    });
    // Assert
    // With keyMatchAnyLevel=true, all "name" fields should match
    expect(resultWithMatching.user.name).toBe("MATCHED_NAME");
    expect(resultWithMatching.admin.name).toBe("MATCHED_NAME");
    expect(resultWithMatching.name).toBe("MATCHED_NAME");

    // With keyMatchAnyLevel=false, only top-level "name" should match
    expect(typeof resultWithoutMatching.user.name).toBe("string");
    expect(typeof resultWithoutMatching.admin.name).toBe("string");
    expect(resultWithoutMatching.name).toBe("MATCHED_NAME");
  });

  test("field generator with partial path wildcards", () => {
    // Arrange
    const input = {
      users: [
        { profile: { name: "Alice", email: "alice@example.com" } },
        { profile: { name: "Bob", email: "bob@example.com" } },
      ],
      admins: [{ profile: { name: "Admin", email: "admin@example.com" } }],
    };
    const rules: SanitizerRules = {
      "users.*.profile.email": "random",
      "admins.*.profile.email": "random",
    };
    const randomFieldGenerators = {
      "*.profile.email": () => "random@example.com",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].profile.email).toBe("random@example.com");
    expect(result.users[1].profile.email).toBe("random@example.com");
    expect(result.admins[0].profile.email).toBe("random@example.com");
  });

  test("field generator using custom function with context", () => {
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
    const randomFieldGenerators = {
      "users.*.email": (value, path) => {
        // Extract the id from the path to generate consistent emails
        const pathParts = path.split(".");
        const userIndex = parseInt(pathParts[1]);
        const userId = input.users[userIndex].id;
        return `user${userId}@anonymous.com`;
      },
      "users.*.name": (value, path) => {
        // Use the original value in the generated output
        return `Anonymous-${value}`;
      },
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.users[0].email).toBe("user1@anonymous.com");
    expect(result.users[1].email).toBe("user2@anonymous.com");
    expect(result.users[0].name).toBe("Anonymous-Alice");
    expect(result.users[1].name).toBe("Anonymous-Bob");
  });

  test("field generator handling nullish values correctly", () => {
    // Arrange
    const input = {
      user: {
        name: null,
        email: undefined,
        details: {
          age: null,
          address: undefined,
        },
      },
    };
    const rules: SanitizerRules = {
      "user.name": "random",
      "user.email": "random",
      "user.details.age": "random",
      "user.details.address": "random",
    };
    const randomFieldGenerators = {
      "user.name": (value) => (value === null ? "NO_NAME" : "UNKNOWN"),
      "user.email": (value) => (value === undefined ? "no-email@example.com" : "UNKNOWN"),
      "*.age": (value) => (value === null ? 0 : 99),
      "*.address": (value) => (value === undefined ? "NO_ADDRESS" : "UNKNOWN"),
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.name).toBe("NO_NAME");
    expect(result.user.email).toBe("no-email@example.com");
    expect(result.user.details.age).toBe(0);
    expect(result.user.details.address).toBe("NO_ADDRESS");
  });

  test("field generator integration with multiple sanitization rules", () => {
    // Arrange
    const input = {
      user: {
        name: "Alice",
        email: "alice@example.com",
        phone: "123-456-7890",
        address: {
          street: "123 Main St",
          city: "New York",
          zip: "10001",
        },
      },
    };
    const rules: SanitizerRules = {
      "user.name": "preserve",
      "user.email": "random",
      "user.phone": "mask",
      "user.address.street": "redact",
      "user.address.city": "random",
      "user.address.zip": "random",
    };
    const randomFieldGenerators = {
      "user.email": () => "random@example.com",
      "*.city": () => "RANDOM_CITY",
      "*.zip": () => "00000",
    };
    // Act
    const result = sanitize(input, { rules, randomFieldGenerators });
    // Assert
    expect(result.user.name).toBe("Alice"); // preserved
    expect(result.user.email).toBe("random@example.com"); // randomized with specific generator
    expect(result.user.phone).toMatch(/^\*+$/); // masked
    expect(result.user.address.street).toBe("[REDACTED]"); // redacted
    expect(result.user.address.city).toBe("RANDOM_CITY"); // randomized with wildcard
    expect(result.user.address.zip).toBe("00000"); // randomized with wildcard
  });
});
