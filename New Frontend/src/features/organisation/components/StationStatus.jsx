import { Ban, CircleCheck, CircleDashed } from "lucide-react";
import { Badge } from "@/ui/index.js";

/** @param {{ status: "verified" | "unverified" | "inactive" }} props */
export function StationStatus({ status }) {
  if (status === "unverified") {
    return (
      <Badge tone="warning">
        <CircleDashed className="size-3" aria-hidden /> Needs verifying
      </Badge>
    );
  }
  if (status === "inactive") {
    return (
      <Badge tone="neutral">
        <Ban className="size-3" aria-hidden /> Inactive
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      <CircleCheck className="size-3" aria-hidden /> Verified
    </Badge>
  );
}
