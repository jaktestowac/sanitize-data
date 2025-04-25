import { sanitize, SanitizerRules } from "./src/index";

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
  "users[*].name": () => "ANONYMIZED", // Added support for bracket notation
};
// Act
const result = sanitize(input, { rules, randomFieldGenerators });
// Assert
console.log(JSON.stringify(result, null, 2));
// Expected: users[0].name = "ANONYMIZED", users[1].name = "ANONYMIZED"
// and users[0].contact.email = users[1].contact.email = "random@example.com"
