import { z } from "zod";

export const signinSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  full_name: z.string().trim().min(2, "Enter your full name"),
  phone: z.string().trim().min(7, "Enter a phone number"),
  email: z.string().trim().email("Enter a valid email address"),
  invite_code: z.string().trim().min(1, "Enter your invitation code").max(80),
  password: z.string().min(8, "Use at least 8 characters"),
});
