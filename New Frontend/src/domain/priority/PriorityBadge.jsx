// Priority of a report or case — docs/02 §8. P1 is urgent and draws the
// eye; P2 and P3 stay quiet.

import { CircleAlert } from "lucide-react";
import { Badge } from "@/ui/index.js";

/** @param {{ priority: "P1" | "P2" | "P3" }} props */
export function PriorityBadge({ priority }) {
  if (priority === "P1") {
    return (
      <Badge tone="danger">
        <CircleAlert className="size-3" aria-hidden /> P1 urgent
      </Badge>
    );
  }
  return <Badge>{priority === "P2" ? "P2" : "P3 low"}</Badge>;
}
