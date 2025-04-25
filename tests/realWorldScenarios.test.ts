import { test, expect, describe } from "vitest";
import { sanitize, SanitizerRules } from "../src/index";

describe("realWorldScenarios", () => {
  test("sanitizing API response with nested structure", () => {
    // Arrange
    const apiResponse = {
      success: true,
      data: {
        user: {
          id: "12345",
          firstName: "John",
          lastName: "Doe",
          email: "john.doe@example.com",
          password: "sensitive!",
          ssn: "123-45-6789",
          address: {
            street: "123 Main St",
            city: "Anytown",
            zip: "12345",
            country: "USA"
          },
          paymentMethods: [
            { type: "card", number: "4111111111111111", expiry: "12/25", cvv: "123" },
            { type: "bank", accountNumber: "9876543210", routingNumber: "021000021" }
          ]
        },
        session: {
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
          created: "2023-01-01T00:00:00Z",
          expires: "2023-01-02T00:00:00Z"
        }
      },
      meta: {
        requestId: "req-123456",
        timestamp: "2023-01-01T00:00:00Z"
      }
    };
    
    // Complex set of rules for different data types
    const rules: SanitizerRules = {
      // Redact highly sensitive data
      "**.password": "redact",
      "**.ssn": "redact",
      "**.cvv": "redact",
      "**.token": "redact",
      
      // Mask identifiable information
      "**.email": "mask",
      "**.firstName": "mask",
      "**.lastName": "mask",
      
      // Randomize financial information
      "**.number": "random", 
      "**.accountNumber": "random",
      "**.routingNumber": "random",
      
      // Preserve non-sensitive data
      "success": "preserve",
      "**.timestamp": "preserve",
      "**.type": "preserve",
      "**.country": "preserve"
    };
    
    // Custom generators for specific fields
    const randomFieldGenerators = {
      "**.number": () => "XXXX-XXXX-XXXX-1111",
      "**.accountNumber": () => "XXXXX1234",
      "**.routingNumber": () => "XXXX5678"
    };
    
    // Act
    const result = sanitize(apiResponse, { 
      rules, 
      randomFieldGenerators,
      redactString: "[REDACTED FOR SECURITY]"
    });
    
    // Assert
    expect(result.success).toBe(true);
    expect(result.data.user.password).toBe("[REDACTED FOR SECURITY]");
    expect(result.data.user.ssn).toBe("[REDACTED FOR SECURITY]");
    expect(result.data.user.email).toMatch(/^\*+$/);
    expect(result.data.user.firstName).toMatch(/^\*+$/);
    expect(result.data.user.lastName).toMatch(/^\*+$/);
    expect(result.data.user.paymentMethods[0].number).toBe("XXXX-XXXX-XXXX-1111");
    expect(result.data.user.paymentMethods[0].cvv).toBe("[REDACTED FOR SECURITY]");
    expect(result.data.user.paymentMethods[1].accountNumber).toBe("XXXXX1234");
    expect(result.data.session.token).toBe("[REDACTED FOR SECURITY]");
    expect(result.meta.timestamp).toBe("2023-01-01T00:00:00Z"); // preserved
  });
  
  test("sanitizing logs for debugging", () => {
    // Arrange
    const logData = {
      level: "error",
      timestamp: "2023-01-01T00:00:00Z",
      message: "Error processing payment for user john.doe@example.com with card 4111-1111-1111-1111",
      context: {
        userId: "12345",
        requestId: "req-123456",
        payload: {
          amount: 100.50,
          cardNumber: "4111111111111111",
          cvv: "123",
          billingAddress: {
            name: "John Doe",
            street: "123 Main St",
            zip: "12345"
          }
        },
        error: {
          code: "PAYMENT_FAILED",
          message: "Error connecting to payment gateway for user john.doe@example.com"
        }
      },
      stack: "Error: Payment failed\n    at processPayment (/app/payment.js:123:45)\n    at handleRequest (/app/index.js:67:89)"
    };
    
    const rules: SanitizerRules = {
      // Sanitize the message that might contain PII
      "message": "random",
      
      // Sanitize any identifiable information
      "**.cardNumber": "mask",
      "**.cvv": "redact",
      "**.name": "mask",
      "**.street": "mask",
      "**.zip": "mask",
      "**.email": "mask",
      
      // Keep essential debug information
      "level": "preserve",
      "timestamp": "preserve",
      "context.error.code": "preserve",
      "stack": "preserve"
    };
    
    const randomFieldGenerators = {
      // Sanitize the message to remove emails and card numbers but keep error context
      "message": (value) => {
        if (typeof value === "string") {
          return value
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "***@***.***") // Email
            .replace(/\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g, "XXXX-XXXX-XXXX-XXXX"); // Card
        }
        return "[SANITIZED MESSAGE]";
      }
    };
    
    // Act
    const result = sanitize(logData, { rules, randomFieldGenerators });
    
    // Assert
    expect(result.message).toContain("***@***.***");
    expect(result.message).toContain("XXXX-XXXX-XXXX-XXXX");
    expect(result.context.payload.cardNumber).toMatch(/^\*+$/);
    expect(result.context.payload.cvv).toBe("[REDACTED]");
    expect(result.context.payload.billingAddress.name).toMatch(/^\*+$/);
    expect(result.level).toBe("error");
    expect(result.stack).toContain("processPayment");
  });
});
