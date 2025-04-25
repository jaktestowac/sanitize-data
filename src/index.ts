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
    const ruleParts = parsePath(ruleKey); // Fix: Use parsePath for ruleKey

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
  parsedPath: string[],
  rules: { [key: string]: SanitizerMode },
  keyMatchAnyLevel: boolean = true,
): SanitizerMode | undefined {
  // Collect all matching rules (including globs)
  let bestMatch: { specificity: number; mode: SanitizerMode } | undefined;

  for (const ruleKey of Object.keys(rules)) {
    const ruleParsedPath = parsePath(ruleKey);

    // Exact path match always wins
    if (ruleKey === path) {
      return rules[ruleKey];
    }

    // Check for ** pattern (matches any nested path)
    if (ruleParsedPath.length > 0 && ruleParsedPath[ruleParsedPath.length - 1] === "**") {
      const baseRulePath = ruleParsedPath.slice(0, -1);
      // Check if the base part matches the beginning of the path
      if (baseRulePath.every((segment, i) => parsedPath[i] === segment) && parsedPath.length >= baseRulePath.length) {
        const specificity = baseRulePath.length * 100 + 1; // Base path length determines specificity
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { specificity, mode: rules[ruleKey] };
        }
      }
    }
    // Check for * pattern (matches one level)
    else if (ruleParsedPath.length > 0 && ruleParsedPath[ruleParsedPath.length - 1] === "*") {
      const baseRulePath = ruleParsedPath.slice(0, -1);
      // Check if the base part matches and we're only one level deeper
      if (
        baseRulePath.every((segment, i) => parsedPath[i] === segment) &&
        parsedPath.length === baseRulePath.length + 1
      ) {
        const specificity = baseRulePath.length * 100 + 2; // More specific than **
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { specificity, mode: rules[ruleKey] };
        }
      }
    }
    // Check for [*] pattern (matches any array element)
    else if (ruleParsedPath.some((segment) => segment === "*")) {
      // Create a pattern where we replace [*] segments with the actual index from path
      const matches = ruleParsedPath.length === parsedPath.length;

      if (matches) {
        let allSegmentsMatch = true;
        let arrayWildcardsCount = 0;

        for (let i = 0; i < ruleParsedPath.length; i++) {
          if (ruleParsedPath[i] === "*") {
            // For array wildcards, we need to check if the path segment is a valid array index
            if (!/^\d+$/.test(parsedPath[i])) {
              allSegmentsMatch = false;
              break;
            }
            arrayWildcardsCount++;
          } else if (ruleParsedPath[i] !== parsedPath[i]) {
            allSegmentsMatch = false;
            break;
          }
        }

        if (allSegmentsMatch) {
          // More specific than * but less than exact match
          // More array wildcards means less specific
          const specificity = ruleParsedPath.length * 100 + 5 - arrayWildcardsCount;
          if (!bestMatch || specificity > bestMatch.specificity) {
            bestMatch = { specificity, mode: rules[ruleKey] };
          }
        }
      }
    }
    // Plain key match at any level
    else if (ruleParsedPath.length === 1 && keyMatchAnyLevel) {
      const keyToMatch = ruleParsedPath[0];
      if (parsedPath[parsedPath.length - 1] === keyToMatch) {
        const specificity = 1; // Least specific match
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { specificity, mode: rules[ruleKey] };
        }
      }
    }
    // Exact path segment matching without globs
    else if (parsedPath.length === ruleParsedPath.length) {
      const allSegmentsMatch = ruleParsedPath.every((segment, i) => parsedPath[i] === segment);
      if (allSegmentsMatch) {
        const specificity = ruleParsedPath.length * 100 + 10; // Highest specificity for exact matches
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { specificity, mode: rules[ruleKey] };
        }
      }
    }
  }

  return bestMatch?.mode;
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

  // Helper function to find a matching randomFieldGenerator
  function findMatchingRandomFieldGenerator(
    path: string,
    parsedPath: string[],
  ): ((value: unknown, path: string) => unknown) | undefined {
    // Exact match first (same as rule matching)
    if (randomFieldGenerators[path]) {
      return randomFieldGenerators[path];
    }

    if (
      randomFieldGeneratorsCaseInsensitive &&
      randomFieldGeneratorsLower &&
      randomFieldGeneratorsLower[path.toLowerCase()]
    ) {
      return randomFieldGeneratorsLower[path.toLowerCase()];
    }

    // Try matching with matchRule to handle all types of wildcards including bracket notation
    for (const genKey of Object.keys(randomFieldGenerators)) {
      // Use the same matchRule function as for rules
      if (matchWildcardPattern(path, genKey, randomFieldGeneratorsCaseInsensitive)) {
        return randomFieldGenerators[genKey];
      }
    }

    // If we reached here and have case-insensitive matching enabled, try again with lowercase keys
    if (randomFieldGeneratorsCaseInsensitive && randomFieldGeneratorsLower) {
      for (const genKey of Object.keys(randomFieldGeneratorsLower)) {
        if (matchWildcardPattern(path.toLowerCase(), genKey, true)) {
          return randomFieldGeneratorsLower[genKey];
        }
      }
    }

    // Handle the case-sensitive and case-insensitive lookups
    const generatorsToCheck =
      randomFieldGeneratorsCaseInsensitive && randomFieldGeneratorsLower
        ? randomFieldGeneratorsLower
        : randomFieldGenerators;

    const compareFn = randomFieldGeneratorsCaseInsensitive
      ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
      : (a: string, b: string) => a === b;

    // Try all field generators using the same matching logic as rule finding
    for (const genKey of Object.keys(
      randomFieldGeneratorsCaseInsensitive ? randomFieldGeneratorsLower! : randomFieldGenerators,
    )) {
      const genKeyParsed = parsePath(genKey);

      // Plain key match at any level
      if (genKeyParsed.length === 1 && keyMatchAnyLevel) {
        const keyToMatch = genKeyParsed[0];
        if (compareFn(parsedPath[parsedPath.length - 1], keyToMatch)) {
          return generatorsToCheck[randomFieldGeneratorsCaseInsensitive ? genKey.toLowerCase() : genKey];
        }
      }

      // Check for * and ** patterns (same logic as in findMostSpecificRule)
      // Check for ** pattern (matches any nested path)
      if (genKeyParsed.length > 0 && genKeyParsed[genKeyParsed.length - 1] === "**") {
        const baseRulePath = genKeyParsed.slice(0, -1);
        // Check if the base part matches the beginning of the path
        if (
          baseRulePath.every((segment, i) => compareFn(segment, parsedPath[i])) &&
          parsedPath.length >= baseRulePath.length
        ) {
          return generatorsToCheck[randomFieldGeneratorsCaseInsensitive ? genKey.toLowerCase() : genKey];
        }
      }
      // Check for * pattern (matches one level)
      else if (genKeyParsed.length > 0 && genKeyParsed[genKeyParsed.length - 1] === "*") {
        const baseRulePath = genKeyParsed.slice(0, -1);
        // Check if the base part matches and we're only one level deeper
        if (
          baseRulePath.every((segment, i) => compareFn(segment, parsedPath[i])) &&
          parsedPath.length === baseRulePath.length + 1
        ) {
          return generatorsToCheck[randomFieldGeneratorsCaseInsensitive ? genKey.toLowerCase() : genKey];
        }
      }
      // Check for [*] pattern (matches any array element)
      else if (genKeyParsed.some((segment) => segment === "*")) {
        // Create a pattern where we replace [*] segments with the actual index from path
        if (genKeyParsed.length === parsedPath.length) {
          let allSegmentsMatch = true;

          for (let i = 0; i < genKeyParsed.length; i++) {
            if (genKeyParsed[i] === "*") {
              // For array wildcards, we need to check if the path segment is a valid array index
              if (!/^\d+$/.test(parsedPath[i])) {
                allSegmentsMatch = false;
                break;
              }
            } else if (!compareFn(genKeyParsed[i], parsedPath[i])) {
              allSegmentsMatch = false;
              break;
            }
          }

          if (allSegmentsMatch) {
            return generatorsToCheck[randomFieldGeneratorsCaseInsensitive ? genKey.toLowerCase() : genKey];
          }
        }
      }
      // Check for exact path match
      else if (parsedPath.length === genKeyParsed.length) {
        const allSegmentsMatch = genKeyParsed.every((segment, i) => compareFn(segment, parsedPath[i]));
        if (allSegmentsMatch) {
          return generatorsToCheck[randomFieldGeneratorsCaseInsensitive ? genKey.toLowerCase() : genKey];
        }
      }
    }

    return undefined;
  }

  // Helper function to match wildcards in paths, including bracket notation
  function matchWildcardPattern(targetPath: string, pattern: string, caseInsensitive: boolean = false): boolean {
    const compareFn = caseInsensitive
      ? (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
      : (a: string, b: string) => a === b;

    // Special case for bracket notation with wildcards - we need to handle this explicitly
    if (pattern.includes("[*]")) {
      // First normalize paths - replace square brackets to make parsing easier
      // Convert "array[0]" to "array.0" format for both pattern and targetPath
      const normalizedPattern = pattern.replace(/\[\*\]/g, ".*");
      const normalizedTarget = targetPath.replace(/\[(\d+)\]/g, ".$1");

      // Create regex pattern by escaping dots and replacing * with digit matcher
      const regexPattern =
        "^" +
        normalizedPattern
          .replace(/\./g, "\\.") // Escape dots
          .replace(/\*/g, "(\\d+)") + // Replace * with digits
        "$";

      const regex = new RegExp(regexPattern, caseInsensitive ? "i" : "");
      return regex.test(normalizedTarget);
    }

    const targetParts = parsePath(targetPath);
    const patternParts = parsePath(pattern);

    // Handle "*.something" pattern (any parent followed by specific key)
    if (pattern.startsWith("*.") && patternParts.length > 1) {
      // Extract the part after "*."
      const suffix = patternParts.slice(1);
      
      // Special case: If targetPath has exactly the same number of parts as the suffix,
      // this means it could be a root-level match (no parent)
      if (targetParts.length === suffix.length) {
        let allMatch = true;
        for (let i = 0; i < suffix.length; i++) {
          if (!compareFn(suffix[i], targetParts[i])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return true;
      }
      
      // Check if the target path ends with the suffix (regular nested case)
      if (targetParts.length > suffix.length) {
        const targetSuffix = targetParts.slice(targetParts.length - suffix.length);
        let allMatch = true;
        for (let i = 0; i < suffix.length; i++) {
          if (!compareFn(suffix[i], targetSuffix[i])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return true;
      }
      
      return false; // No match for "*.something" pattern
    }

    // If pattern has a different number of parts, it's definitely not a match
    // unless we're dealing with ** wildcards or *.suffix patterns which we've already handled
    if (!pattern.includes("**") && patternParts.length !== targetParts.length) {
      return false;
    }

    // Handle ** wildcard pattern (matches any nested path)
    if (patternParts.includes("**")) {
      const index = patternParts.indexOf("**");
      // Check if parts before ** match
      for (let i = 0; i < index; i++) {
        if (patternParts[i] !== "*" && !compareFn(patternParts[i], targetParts[i] || "")) {
          return false;
        }
      }
      // If ** is the last part, match everything after
      if (index === patternParts.length - 1) return true;

      // Otherwise, more complex matching required
      return false; // Simplified, you can expand if needed
    }

    // Standard segment by segment comparison
    for (let i = 0; i < patternParts.length; i++) {
      // Handle wildcard
      if (patternParts[i] === "*") {
        // For bracket notation or dot notation, an asterisk can match any segment
        // We don't require numeric index for general wildcards
        continue;
      }
      // Regular segment comparison
      else if (!compareFn(patternParts[i], targetParts[i])) {
        return false;
      }
    }

    return true;
  }

  const walk = (obj: any, path: string[] = []): any => {
    if (obj === null || typeof obj !== "object") return obj;

    const result: any = Array.isArray(obj) ? [] : {};

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
          // Apply the field generator if found, otherwise use default random handling
          if (fieldGen) {
            result[key] = fieldGen(value, fullPath);
          } else if (value !== null && typeof value === "object") {
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
