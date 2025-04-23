export type SanitizerMode = "mask" | "redact" | "random" | "preserve";

export interface SanitizeOptions {
  /**
   * A map of keys to sanitization modes.
   * Keys can be dot-paths, shallow keys, or glob patterns.
   *
   * Examples:
   *   { email: "redact" } // redact any "email" key at any level (see keyMatchAnyLevel)
   *   { "user.email": "mask" } // mask only user.email
   *   { "user.*": "mask" } // mask all direct children of user
   *   { "user.**": "redact" } // redact all nested keys under user
   */
  rules: Record<string, SanitizerMode>;

  /**
   * Optional fallback mode if no rule matches a key.
   * @default "preserve"
   *
   * Example:
   *   { defaultMode: "mask" }
   */
  defaultMode?: SanitizerMode;

  /**
   * Optional string to use for redacted values.
   * @default "[REDACTED]"
   *
   * Example:
   *   { redactString: "<REMOVED>" }
   */
  redactString?: string;

  /**
   * Optional string to use for random values.
   * Used for objects/arrays or unknown types.
   * @default "[random]"
   *
   * Example:
   *   { randomString: "<RANDOM>" }
   */
  randomString?: string;

  /**
   * Optional custom random value generators per type.
   * Keys: "number" | "string" | "boolean" | "array" | "object"
   *
   * Example:
   *   {
   *     randomGenerators: {
   *       number: () => 42,
   *       string: () => "RANDOM",
   *       array: arr => arr.map(() => "X")
   *     }
   *   }
   */
  randomGenerators?: Partial<{
    number: () => unknown;
    string: () => unknown;
    boolean: () => unknown;
    array: (arr: any[]) => unknown;
    object: (obj: object) => unknown;
  }>;

  /**
   * Optional custom random value generators for specific fields (by path or key).
   * Keys: field name or dot-path, value: function (value, path) => unknown
   *
   * Example:
   *   {
   *     randomFieldGenerators: {
   *       name: () => "RANDOM_NAME",
   *       "user.surname": () => "RANDOM_SURNAME"
   *     }
   *   }
   */
  randomFieldGenerators?: Record<string, (value: unknown, path: string) => unknown>;

  /**
   * If true, randomFieldGenerators keys are matched case-insensitively (default: false)
   *
   * Example:
   *   { randomFieldGeneratorsCaseInsensitive: true }
   */
  randomFieldGeneratorsCaseInsensitive?: boolean;

  /**
   * If true, rules with a plain key (e.g. "email") match at any level (default: true).
   * If false, such rules only match top-level keys.
   *
   * Example:
   *   { keyMatchAnyLevel: false }
   */
  keyMatchAnyLevel?: boolean;
}

function matchRule(path: string, rules: Record<string, SanitizerMode>): SanitizerMode | undefined {
  // Exact match first
  if (rules[path]) return rules[path];

  const pathParts = path.split(".");

  // Try glob patterns in rules
  for (const ruleKey of Object.keys(rules)) {
    const ruleParts = ruleKey.split(".");

    // Recursive helper for '**' matching
    function match(i: number, j: number): boolean {
      while (i < ruleParts.length) {
        if (ruleParts[i] === "**") {
          // '**' at end matches all remaining segments (including zero)
          if (i === ruleParts.length - 1) {
            return true;
          }
          // Try to match '**' with any number of segments
          for (let skip = 0; j + skip <= pathParts.length; skip++) {
            if (match(i + 1, j + skip)) return true;
          }
          return false;
        }
        if (j < pathParts.length && (ruleParts[i] === "*" || ruleParts[i] === pathParts[j])) {
          i++;
          j++;
        } else {
          return false;
        }
      }
      return j === pathParts.length;
    }

    if (match(0, 0)) {
      return rules[ruleKey];
    }
  }

  // No glob match
  return undefined;
}

function findMostSpecificRule(
  path: string,
  rules: Record<string, SanitizerMode>,
  keyMatchAnyLevel: boolean = true,
): SanitizerMode | undefined {
  // Collect all matching rules (including globs)
  let bestMatch: { length: number; mode: SanitizerMode } | undefined;
  const pathParts = path.split(".");
  for (const ruleKey of Object.keys(rules)) {
    if (ruleKey === path) {
      // Exact match always wins
      return rules[ruleKey];
    }
    // Handle .** glob
    if (ruleKey.endsWith(".**")) {
      const base = ruleKey.slice(0, -3); // Remove .**
      if ((base && path.startsWith(base + ".") && path.length > base.length + 1) || (base && path === base)) {
        if (!bestMatch || ruleKey.length > bestMatch.length) {
          bestMatch = { length: ruleKey.length, mode: rules[ruleKey] };
        }
      }
    }
    // Handle .* glob (one level deep)
    else if (ruleKey.endsWith(".*")) {
      const base = ruleKey.slice(0, -2);
      if (base === "" || path.startsWith(base + ".")) {
        const rest = path.slice(base.length ? base.length + 1 : 0);
        if (rest.length > 0 && !rest.includes(".")) {
          if (!bestMatch || ruleKey.length > bestMatch.length) {
            bestMatch = { length: ruleKey.length, mode: rules[ruleKey] };
          }
        }
      }
    }
    // Plain key match: match at any level or only top-level depending on option
    else if (!ruleKey.includes(".")) {
      if (
        (keyMatchAnyLevel && pathParts[pathParts.length - 1] === ruleKey) ||
        (!keyMatchAnyLevel && pathParts.length === 1 && pathParts[0] === ruleKey)
      ) {
        if (!bestMatch || ruleKey.length > bestMatch.length) {
          bestMatch = { length: ruleKey.length, mode: rules[ruleKey] };
        }
      }
    }
  }
  return bestMatch?.mode;
}

export function sanitize(input: any, options: SanitizeOptions): any {
  const {
    rules,
    defaultMode = "preserve",
    redactString = "[REDACTED]",
    randomString = "[random]",
    randomGenerators = {},
    randomFieldGenerators = {},
    randomFieldGeneratorsCaseInsensitive = false,
    keyMatchAnyLevel = true,
  } = options;

  // Prepare lowercased keys for case-insensitive matching if needed
  let randomFieldGeneratorsLower: Record<string, (value: unknown, path: string) => unknown> | undefined;
  if (randomFieldGeneratorsCaseInsensitive) {
    randomFieldGeneratorsLower = {};
    for (const k of Object.keys(randomFieldGenerators)) {
      randomFieldGeneratorsLower[k.toLowerCase()] = randomFieldGenerators[k];
    }
  }

  const walk = (obj: any, path: string[] = []): any => {
    if (obj === null || typeof obj !== "object") return obj;

    const result: any = Array.isArray(obj) ? [] : {};

    for (const key of Object.keys(obj)) {
      const fullPath = [...path, key].join(".");

      // Find the most specific rule for this path
      let mode: SanitizerMode | undefined = findMostSpecificRule(fullPath, rules, keyMatchAnyLevel);
      if (!mode) mode = defaultMode;
      const value = obj[key];

      switch (mode) {
        case "mask":
          // Only mask primitives, not objects/arrays
          if (value !== null && typeof value === "object") {
            // For mask, do not mask objects, just recurse
            result[key] = walk(value, [...path, key]);
          } else {
            result[key] = maskValue(value);
          }
          break;
        case "redact":
          // Redact everything, including objects
          result[key] = redactString;
          break;
        case "random": {
          // Field-specific generator: prefer fullPath, then key (with keyMatchAnyLevel logic)
          let fieldGen: ((value: unknown, path: string) => unknown) | undefined;
          if (randomFieldGeneratorsCaseInsensitive && randomFieldGeneratorsLower) {
            fieldGen =
              randomFieldGeneratorsLower[fullPath.toLowerCase()] ||
              (keyMatchAnyLevel
                ? randomFieldGeneratorsLower[key.toLowerCase()]
                : path.length === 0
                  ? randomFieldGeneratorsLower[key.toLowerCase()]
                  : undefined);
          } else {
            fieldGen =
              randomFieldGenerators[fullPath] ||
              (keyMatchAnyLevel
                ? randomFieldGenerators[key]
                : path.length === 0
                  ? randomFieldGenerators[key]
                  : undefined);
          }
          // If fieldGen is not found, check for any matching path suffix, partial path, or "*." partial path in randomFieldGenerators
          if (!fieldGen && fullPath.includes(".")) {
            const parts = fullPath.split(".");
            // Try all possible suffixes (not just parents), longest first
            for (let i = 1; i < parts.length; i++) {
              const suffix = parts.slice(i).join(".");
              if (randomFieldGeneratorsCaseInsensitive && randomFieldGeneratorsLower) {
                if (randomFieldGeneratorsLower[suffix.toLowerCase()]) {
                  fieldGen = randomFieldGeneratorsLower[suffix.toLowerCase()];
                  break;
                }
              } else {
                if (randomFieldGenerators[suffix]) {
                  fieldGen = randomFieldGenerators[suffix];
                  break;
                }
              }
            }
            // Try all possible partial paths (not just suffixes), longest first
            if (!fieldGen) {
              for (let len = parts.length; len > 1; len--) {
                for (let start = 0; start <= parts.length - len; start++) {
                  const partial = parts.slice(start, start + len).join(".");
                  if (randomFieldGeneratorsCaseInsensitive && randomFieldGeneratorsLower) {
                    if (randomFieldGeneratorsLower[partial.toLowerCase()]) {
                      fieldGen = randomFieldGeneratorsLower[partial.toLowerCase()];
                      break;
                    }
                  } else {
                    if (randomFieldGenerators[partial]) {
                      fieldGen = randomFieldGenerators[partial];
                      break;
                    }
                  }
                }
                if (fieldGen) break;
              }
            }
          }
          // Try "*.<key>" partial path (matches any parent, direct key, or top-level key)
          if (!fieldGen) {
            const parts = fullPath.split(".");
            const starKey = `*.${parts[parts.length - 1]}`;
            if (randomFieldGeneratorsCaseInsensitive && randomFieldGeneratorsLower) {
              if (randomFieldGeneratorsLower[starKey.toLowerCase()]) {
                fieldGen = randomFieldGeneratorsLower[starKey.toLowerCase()];
              }
            } else {
              if (randomFieldGenerators[starKey]) {
                fieldGen = randomFieldGenerators[starKey];
              }
            }
          }
          if (fieldGen) {
            result[key] = fieldGen(value, fullPath);
          } else if (value !== null && typeof value === "object") {
            // If a random object generator is provided, use it
            if (randomGenerators.object && !Array.isArray(value)) {
              // If randomFieldGenerators are present, apply them to each property
              if (
                Object.keys(randomFieldGenerators).length > 0 ||
                (randomFieldGeneratorsLower && Object.keys(randomFieldGeneratorsLower).length > 0)
              ) {
                // Recurse into children and apply randomFieldGenerators to nested fields
                result[key] = walk(value, [...path, key]);
              } else {
                result[key] = randomGenerators.object(value);
              }
            }
            // If a random array generator is provided, use it
            else if (randomGenerators.array && Array.isArray(value)) {
              result[key] = randomGenerators.array(value);
            }
            // Otherwise, recurse into the object/array
            else {
              result[key] = walk(value, [...path, key]);
            }
          } else {
            result[key] = randomValue(value, randomString, randomGenerators);
          }
          break;
        }
        case "preserve":
        default:
          result[key] = typeof value === "object" ? walk(value, [...path, key]) : value;
      }
    }
    return result;
  };

  return walk(input);
}

// 🕶 Masking = fixed symbol replacement
function maskValue(value: unknown): string {
  const str = String(value);
  return "*".repeat(Math.min(8, str.length));
}

// 🎲 Simple random replacement per primitive type
function randomValue(
  value: unknown,
  randomString = "[random]",
  randomGenerators: SanitizeOptions["randomGenerators"] = {},
): unknown {
  if (typeof value === "number" && randomGenerators.number) return randomGenerators.number();
  if (typeof value === "string" && randomGenerators.string) return randomGenerators.string();
  if (typeof value === "boolean" && randomGenerators.boolean) return randomGenerators.boolean();
  if (Array.isArray(value) && randomGenerators.array) return randomGenerators.array(value);
  if (typeof value === "object" && value !== null && randomGenerators.object) return randomGenerators.object(value);

  if (typeof value === "number") return Math.floor(Math.random() * 10000);
  if (typeof value === "string") return Math.random().toString(36).slice(2, 10);
  if (typeof value === "boolean") return Math.random() > 0.5;
  if (Array.isArray(value)) return value.map(() => randomValue(value[0], randomString, randomGenerators));
  return randomString;
}
