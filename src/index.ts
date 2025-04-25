export type SanitizerMode = "mask" | "redact" | "random" | "preserve";

export interface SanitizerRules {
  [key: string]: SanitizerMode;
}

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
  rules?: { [key: string]: SanitizerMode };

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

function parsePath(path: string): string[] {
  // Parse dot notation and bracket notation
  const parts: string[] = [];
  let currentPart = "";
  let inBrackets = false;

  for (let i = 0; i < path.length; i++) {
    const char = path[i];

    if (char === "." && !inBrackets) {
      if (currentPart) {
        parts.push(currentPart);
        currentPart = "";
      }
    } else if (char === "[" && !inBrackets) {
      if (currentPart) {
        parts.push(currentPart);
        currentPart = "";
      }
      inBrackets = true;
    } else if (char === "]" && inBrackets) {
      parts.push(currentPart);
      currentPart = "";
      inBrackets = false;
    } else {
      currentPart += char;
    }
  }

  if (currentPart) {
    parts.push(currentPart);
  }
  return parts;
}

function matchRule(path: string, rules: { [key: string]: SanitizerMode }): SanitizerMode | undefined {
  // Exact match first
  if (rules[path]) return rules[path];

  const pathParts = parsePath(path);

  // Try glob patterns in rules
  for (const ruleKey of Object.keys(rules)) {
    const ruleParts = parsePath(ruleKey);

    if (isWildcardMatch(pathParts, ruleParts, pathParts)) {
      return rules[ruleKey];
    }
  }

  // No glob match
  return undefined;
}

// Helper function to determine if a path matches a pattern with wildcards
function isWildcardMatch(pathParts: string[], patternParts: string[], alwyasFullPath: string[]): boolean {
  let i = 0,
    j = 0;

  while (i < pathParts.length && j < patternParts.length) {
    if (patternParts[j] === "**") {
      // '**' matches any number of segments, including zero
      if (j === patternParts.length - 1) return true; // '**' at the end matches everything
      while (i < pathParts.length) {
        if (isWildcardMatch(pathParts.slice(i), patternParts.slice(j + 1), alwyasFullPath)) return true;
        i++;
      }
      return false;
    } else if (patternParts[j] === "*") {
      // '*' matches exactly one segment
      i++;
      j++;
    } else if (patternParts[j] === pathParts[i]) {
      i++;
      j++;
    } else {
      return false;
    }
  }

  // Handle special case for "*.key" pattern
  if (patternParts.length === 2 && patternParts[0] === "*") {
    // For root-level fields (path length = 1), return true to apply the rule
    if (pathParts.length === 1 && alwyasFullPath.length === 1 && pathParts[0] === patternParts[1]) {
      return true;
    }

    return false;
  }

  // Check if both path and pattern are fully matched
  return i === pathParts.length && j === patternParts.length;
}

function findMostSpecificRule(
  path: string,
  parsedPath: string[],
  rules: { [key: string]: SanitizerMode },
  keyMatchAnyLevel: boolean = true,
): SanitizerMode | undefined {
  let bestMatch: { specificity: number; mode: SanitizerMode } | undefined;

  for (const ruleKey of Object.keys(rules)) {
    const ruleParts = parsePath(ruleKey);

    // Treat single field names (e.g., "key") as "**.key"
    const normalizedRuleParts = ruleParts.length === 1 ? ["**", ...ruleParts] : ruleParts;

    if (isWildcardMatch(parsedPath, normalizedRuleParts, parsedPath)) {
      const specificity = calculateSpecificity(normalizedRuleParts);
      if (!bestMatch || specificity > bestMatch.specificity) {
        bestMatch = { specificity, mode: rules[ruleKey] };
      }
    }
  }

  return bestMatch?.mode;
}

// Helper function to calculate specificity of a rule
function calculateSpecificity(patternParts: string[]): number {
  return patternParts.reduce((score, part) => {
    if (part === "**") return score + 1; // Least specific
    if (part === "*") return score + 10; // More specific
    return score + 100; // Most specific
  }, 0);
}

export function sanitize(input: any, options: SanitizeOptions): any {
  const {
    rules = {},
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

  // We DO NOT normalize randomGenerators into randomFieldGenerators for proper precedence
  // Track objects to detect circular references
  const seen = new WeakMap<object, any>();

  // Helper function to find a matching randomFieldGenerator
  function findMatchingRandomFieldGenerator(
    path: string,
    parsedPath: string[],
  ): ((value: unknown, path: string) => unknown) | undefined {
    // Exact match first
    if (randomFieldGenerators[path]) {
      return randomFieldGenerators[path];
    }

    // Case-insensitive exact match
    if (randomFieldGeneratorsCaseInsensitive) {
      const lowerPath = path.toLowerCase();
      if (randomFieldGeneratorsLower && randomFieldGeneratorsLower[lowerPath]) {
        return randomFieldGeneratorsLower[lowerPath];
      }

      // Try case-insensitive exact match with normalized generators
      for (const genKey of Object.keys(randomFieldGenerators)) {
        if (genKey.toLowerCase() === lowerPath) {
          return randomFieldGenerators[genKey];
        }
      }
    }

    // Find the most specific matching generator
    let bestMatch:
      | {
          specificity: number;
          generator: (value: unknown, path: string) => unknown;
        }
      | undefined;

    // Helper function to check and update the best match
    const checkAndUpdateBestMatch = (
      genKey: string,
      generator: (value: unknown, path: string) => unknown,
      isCaseInsensitive: boolean,
    ) => {
      const genKeyParsed = parsePath(genKey);
      const normalizedGenKeyParsed =
        keyMatchAnyLevel && genKeyParsed.length === 1 ? ["**", ...genKeyParsed] : genKeyParsed;

      // For case-insensitive matching, we need to compare parts case-insensitively
      const match = isCaseInsensitive
        ? isWildcardMatchCaseInsensitive(parsedPath, normalizedGenKeyParsed, parsedPath)
        : isWildcardMatch(parsedPath, normalizedGenKeyParsed, parsedPath);

      if (match) {
        const specificity = calculateSpecificity(normalizedGenKeyParsed);
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { specificity, generator };
        }
      }
    };

    // Check case-sensitive matches
    for (const genKey of Object.keys(randomFieldGenerators)) {
      checkAndUpdateBestMatch(genKey, randomFieldGenerators[genKey], false);
    }

    // Check case-insensitive matches if enabled
    if (randomFieldGeneratorsCaseInsensitive) {
      for (const genKey of Object.keys(randomFieldGenerators)) {
        checkAndUpdateBestMatch(genKey, randomFieldGenerators[genKey], true);
      }
    }

    return bestMatch?.generator;
  }

  // Helper function for case-insensitive wildcard matching
  function isWildcardMatchCaseInsensitive(
    pathParts: string[],
    patternParts: string[],
    alwaysFullPath: string[],
  ): boolean {
    // Convert all parts to lowercase for comparison
    const lowerPathParts = pathParts.map((part) => part.toLowerCase());
    const lowerPatternParts = patternParts.map((part) => (part === "*" || part === "**" ? part : part.toLowerCase()));
    const lowerFullPath = alwaysFullPath.map((part) => part.toLowerCase());

    return isWildcardMatch(lowerPathParts, lowerPatternParts, lowerFullPath);
  }

  const walk = (obj: any, path: string[] = []): any => {
    if (obj === null || typeof obj !== "object") return obj;

    // Handle circular references
    if (seen.has(obj)) {
      return seen.get(obj);
    }

    const result: any = Array.isArray(obj) ? [] : {};

    // Add to seen objects before recursing
    seen.set(obj, result);

    // Check if this object is an array and has a direct rule for the path
    const currentPath = path.join(".");
    const isArrayWithDirectRule = Array.isArray(obj) && rules[currentPath] === "random";

    // If this array itself has a random rule (not just its elements),
    // apply randomization to the entire array
    if (isArrayWithDirectRule) {
      return randomValue(obj, randomString, randomGenerators);
    }

    for (const key of Object.keys(obj)) {
      const fullPath = [...path, key].join(".");
      const parsedPath = parsePath(fullPath);

      // Find the most specific rule for this path
      let mode: SanitizerMode | undefined = findMostSpecificRule(
        parsedPath.join("."),
        parsedPath,
        rules,
        keyMatchAnyLevel,
      );
      if (!mode) mode = defaultMode;
      const value = obj[key];

      // Find matching field generator
      const fieldGen = findMatchingRandomFieldGenerator(fullPath, parsedPath);

      // Apply the field generator if found, regardless of mode
      if (fieldGen) {
        result[key] = fieldGen(value, fullPath);
        continue; // Skip to next field
      }

      // Process according to mode if no field generator matched
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
          if (value !== null && typeof value === "object") {
            // If a random object generator is provided, use it
            if (randomGenerators.object && !Array.isArray(value)) {
              // If randomFieldGenerators are present, apply them to each property
              if (Object.keys(randomFieldGenerators).length > 0) {
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
            // Apply type-based generators (test expects these to have precedence)
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

  if (Array.isArray(value)) {
    return value.map((item) => {
      // Randomize each element individually rather than using the first element's type
      if (typeof item === "number") return Math.floor(Math.random() * 10000);
      if (typeof item === "string") return Math.random().toString(36).slice(2, 10);
      if (typeof item === "boolean") return Math.random() > 0.5;
      if (item === null || item === undefined) return randomString;
      if (typeof item === "object") return randomString; // For objects inside arrays, use randomString
      return randomString;
    });
  }

  return randomString;
}
