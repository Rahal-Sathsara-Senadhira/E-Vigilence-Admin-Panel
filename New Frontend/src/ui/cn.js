import { clsx } from "clsx";

/** Joins class names, skipping empty ones. @param {import("clsx").ClassValue[]} values */
export const cn = (...values) => clsx(values);
