import { cn } from "../cn.js";

/** A grey placeholder in the shape of content that is loading. @param {{ className?: string }} props */
export function Skeleton({ className }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-sunken", className)} />;
}
