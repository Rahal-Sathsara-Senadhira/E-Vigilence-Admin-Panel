// One report on its own page (phones, links, search).

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Page } from "@/ui/index.js";
import { ReportRecord } from "../components/ReportRecord.jsx";

export function ReportPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  return (
    <Page
      title="Report"
      className="max-w-[1100px]"
      back={
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> All reports
        </Link>
      }
    >
      <ReportRecord key={id} id={id} canUpload={can(user, "reports.record")} />
    </Page>
  );
}
