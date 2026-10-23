// Sign-in and password rules — docs/17-architecture-and-stack.md §6.

import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;

// The most common passwords and obvious patterns; the API also refuses a
// password that contains the user's email name or NIC.
const COMMON_PASSWORDS = new Set([
  "123456789012",
  "password1234",
  "passwordpassword",
  "qwertyuiop12",
  "iloveyou1234",
  "admin1234567",
  "srilanka1234",
  "police123456",
  "welcome12345",
  "changeme1234",
]);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(128, "Use at most 128 characters.")
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), "This password is too common.")
  .refine((p) => new Set(p).size >= 5, "Use a less repetitive password.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");

export const mfaVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: otpCodeSchema,
});
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export const mfaSetupSchema = z.object({
  challengeToken: z.string().min(1),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "The new password must be different.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** What the API returns after the password step. */
export type LoginResult =
  | { status: "signedIn"; session: SessionPayload }
  | { status: "mfaRequired"; challengeToken: string }
  | { status: "mfaSetupRequired"; challengeToken: string };

export interface SessionPayload {
  accessToken: string;
  expiresAt: string;
  user: CurrentUser;
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: import("../roles.js").StaffRole;
  stationId: string | null;
  stationName: string | null;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
}
