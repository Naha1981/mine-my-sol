import { describe, expect, it } from "vitest";
import { registerSchema, signinSchema } from "./auth-schemas";

const validRegistration = {
  full_name: "Test Contractor",
  phone: "0712345678",
  email: "contractor@example.com",
  invite_code: "ABCD1234",
  password: "correct-horse-battery",
};

describe("registration schema", () => {
  it("accepts a complete registration with an invitation code", () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
  });

  it("rejects registration without an invitation code", () => {
    const result = registerSchema.safeParse({ ...validRegistration, invite_code: "   " });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "invite_code")).toBe(true);
    }
  });

  it("rejects invalid email addresses and short passwords", () => {
    expect(
      registerSchema.safeParse({
        ...validRegistration,
        email: "not-an-email",
        password: "short",
      }).success,
    ).toBe(false);
  });
});

describe("sign-in schema", () => {
  it("keeps sign-in validation independent from the registration invitation requirement", () => {
    expect(signinSchema.safeParse({ email: "admin@example.com", password: "password" }).success).toBe(true);
    expect(signinSchema.safeParse({ email: "admin@example.com", password: "" }).success).toBe(false);
  });
});
