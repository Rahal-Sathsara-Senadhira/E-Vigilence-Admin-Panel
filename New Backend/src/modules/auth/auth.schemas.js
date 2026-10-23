// Request bodies for signing in — docs/20 §9.

import { z } from "zod";
import { MAX_LENGTH } from "#src/core/auth/passwords.js";

const challenge = z.string().min(10, "Please sign in again.");

export const signInSchema = z.object({
  /** Email address or police service number. */
  identifier: z.string().trim().min(1, "Enter your email or service number.").max(160),
  password: z.string().min(1, "Enter your password.").max(MAX_LENGTH),
});

export const verifyMfaSchema = z
  .object({
    challenge,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.")
      .optional(),
    recoveryCode: z
      .string()
      .trim()
      .min(8, "Enter a recovery code, like 7KQ4-M2XD.")
      .max(20)
      .optional(),
  })
  .refine((v) => v.code || v.recoveryCode, {
    message: "Enter the 6-digit code from your authenticator app.",
    path: ["code"],
  });

export const firstPasswordSchema = z.object({
  challenge,
  newPassword: z.string().min(1, "Choose a new password.").max(MAX_LENGTH),
});

export const mfaSetupStartSchema = z.object({ challenge });

export const mfaSetupConfirmSchema = z.object({
  challenge,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(MAX_LENGTH),
  newPassword: z.string().min(1, "Choose a new password.").max(MAX_LENGTH),
});
