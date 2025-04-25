# sanitize-data

A powerful, zero-dependency TypeScript/JavaScript utility for sanitizing, masking, redacting, or randomizing sensitive data in objects, arrays, and deeply nested structures. Designed for logs, API responses, test snapshots, and anywhere you need to control data exposure.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Features

- 🔑 Rule-based masking, redacting, randomizing, or preserving of fields
- 🧬 Supports dot-paths, glob patterns (`*`, `**`), key-based, partial, and wildcard rules
- 🔁 Recursively processes deeply nested objects and arrays
- 🧩 Custom random value generators per type or per field (by path, partial path, or wildcard)
- 🦾 Handles arrays, objects, primitives, null/undefined, and edge cases
- 🔒 Safe for logs, API responses, and test snapshots
- 🪶 Zero dependencies

---

## 📦 Install

```bash
npm install sanitize-data
```

---

## 🚀 Usage

```typescript
import { sanitize } from "sanitize-data";

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

const rules = {
  "user.email": "redact", // redact only user.email
  "user.*": "mask", // mask all direct children of user
  "user.**": "redact", // redact all nested keys under user (overrides above for deeper fields)
  token: "redact", // redact token at any level
  arr: "random", // randomize array values
  score: "random", // randomize any key named "score" at any level
};

const result = sanitize(input, { rules });

console.log(result);
// {
//   user: {
//     email: "[REDACTED]",
//     name: "********",
//     meta: {
//       city: "[REDACTED]",
//       zip: "[REDACTED]"
//     },
//     contact: {
//       phone: "[REDACTED]",
//       address: "[REDACTED]"
//     }
//   },
//   token: "[REDACTED]",
//   arr: [ 4821, 1937, 8203 ], // random numbers (example)
//   info: { score: 5721 }      // random number (example)
// }
```

---

## ⚙️ API

### `sanitize(input, options)`

#### `input`

- Any object, array, or primitive value to sanitize.

#### `options`

| Option                                 | Type                                                | Default        | Description                                                                                   |
| -------------------------------------- | --------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `rules`                                | `{ [key: string]: SanitizerMode }`                  | **required**   | Map of rules. Keys can be dot-paths, globs, key names, partials, or wildcards.                |
| `defaultMode`                          | `"mask" \| "redact" \| "random" \| "preserve"`      | `"preserve"`   | Fallback mode if no rule matches.                                                             |
| `redactString`                         | `string`                                            | `"[REDACTED]"` | String to use for redacted values.                                                            |
| `randomString`                         | `string`                                            | `"[random]"`   | String to use for random values (for unknown types).                                          |
| `randomGenerators`                     | `Partial<{number, string, boolean, array, object}>` | `{}`           | Custom random value generators per type.                                                      |
| `randomFieldGenerators`                | `{ [key: string]: (value, path) => any }`           | `{}`           | Custom random value generators for specific fields (by key, dot-path, partial, or `"*.key"`). |
| `randomFieldGeneratorsCaseInsensitive` | `boolean`                                           | `false`        | If true, field generator keys are matched case-insensitively.                                 |
| `keyMatchAnyLevel`                     | `boolean`                                           | `true`         | If true, rules with a plain key match at any level; if false, only top-level.                 |

#### `SanitizerMode`

- `"mask"`: Replace value with asterisks (e.g., `"****"`).
- `"redact"`: Replace value with `redactString`.
- `"random"`: Replace value with a random value (see options).
- `"preserve"`: Leave value unchanged.

---

## 🧩 Advanced: Custom Random Generators

You can control randomization per type or per field, including wildcard paths:

```typescript
const rules = {
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
  array: (arr) => arr.map(() => "ARR"), // all array elements replaced with "ARR"
  object: (obj) => ({ replaced: true }), // replace object with a fixed value
};

const randomFieldGenerators = {
  password: () => "XXX",
  "*.name": () => "ANON",
  "user.surname": () => "SURNAME",
  "meta.score": () => "SCORE",
  "*.token": () => "ANY_TOKEN",
};

const input = {
  password: "abc",
  age: 30,
  user: { name: "Alice", surname: "Smith", token: "tok1" },
  meta: { score: 100, token: "tok2" },
  token: "tok3",
};

const result = sanitize(input, {
  rules,
  randomGenerators,
  randomFieldGenerators,
});

console.log(result);
// {
//   password: "XXX",
//   age: 123, // random number
//   user: { name: "ANON", surname: "SURNAME", token: "ANY_TOKEN" },
//   meta: { score: "SCORE", token: "ANY_TOKEN" },
//   token: "ANY_TOKEN"
// }
```

### Important Note on Field Generators

Field generators are always applied when a match is found, regardless of the field's sanitization mode or rules. This means you can use field generators to transform specific fields even if they're not explicitly marked as "random" in your rules.

```typescript
const input = {
  company: {
    departments: [{ name: "Engineering" }, { name: "Marketing" }],
  },
};

// No rules (defaultMode: "preserve"), but field generators still apply
const randomFieldGenerators = {
  "**.name": (val) => `Anonymous-${val}`,
};

const result = sanitize(input, { randomFieldGenerators });
console.log(result);
// {
//   company: {
//     departments: [
//       { name: "Anonymous-Engineering" },
//       { name: "Anonymous-Marketing" }
//     ]
//   }
// }
```

---

## 🧪 Rule & Field Generator Matching

- `"user.email"`: Exact path match
- `"user.*"`: Matches any direct child of `user`
- `"user.**"`: Matches any nested field under `user`
- `"email"`: Matches any key named `email` (at any level, unless `keyMatchAnyLevel: false`)
- `"*.key"`: Matches any key one level deep with the name `key`
- `"**.key"`: Matches any key at any level with the name `key`

### Bracket Notation

The library also supports bracket notation for arrays:

```typescript
const rules = {
  "products[*].variants[*].color": "random",
};

const randomFieldGenerators = {
  "products[*].variants[*].color": () => "randomized-color",
};
```

---

## 📝 More Examples

### Mask all fields except a few

```typescript
const input = { a: 1, b: 2, c: 3 };
const rules = { a: "preserve" };
const result = sanitize(input, { rules, defaultMode: "mask" });
// { a: 1, b: "********", c: "********" }
```

### Redact all nested fields under a key

```typescript
const input = { user: { name: "Alice", meta: { city: "NY" } }, admin: { name: "Bob" } };
const rules = { "user.**": "redact" };
const result = sanitize(input, { rules });
// {
//   user: {
//     name: "[REDACTED]",
//     meta: "[REDACTED]"
//   },
//   admin: { name: "Bob" }
// }
```

### Use custom random string for all randoms

```typescript
const input = { foo: "bar", arr: [1, 2, 3] };
const rules = { foo: "random", arr: "random" };
const result = sanitize(input, { rules, randomString: "<RANDOM>" });
// {
//   foo: "abc123", // random string
//   arr: [2145, 8721, 3019] // random numbers
// }
```

---

## 📄 License

MIT © jaktestowac.pl

Powered by [jaktestowac.pl](https://www.jaktestowac.pl/) team!
