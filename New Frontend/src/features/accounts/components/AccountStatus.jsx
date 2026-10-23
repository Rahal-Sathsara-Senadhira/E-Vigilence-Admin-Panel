import { Ban, CircleCheck, Lock } from "lucide-react";
import { Badge } from "@/ui/index.js";

/** @param {{ status: "active" | "inactive" | "locked" }} props */
export function AccountStatus({ status }) {
  if (status === "locked") {
    return (
      <Badge tone="warning">
        <Lock className="size-3" aria-hidden /> Locked
      </Badge>
    );
  }
  if (status === "inactive") {
    return (
      <Badge tone="neutral">
        <Ban className="size-3" aria-hidden /> Deactivated
      </Badge>
    );
  }
  return (
    <Badge tone="success">
      <CircleCheck className="size-3" aria-hidden /> Active
    </Badge>
  );
}
