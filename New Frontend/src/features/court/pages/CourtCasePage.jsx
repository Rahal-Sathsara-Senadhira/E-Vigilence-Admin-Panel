// One court case on its own page.

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { Page } from "@/ui/index.js";
import { CourtRecord } from "../components/CourtRecord.jsx";

export function CourtCasePage() {
  const { id = "" } = useParams();
  return (
    <Page
      title="Court case"
      className="max-w-[1100px]"
      back={
        <Link
          to="/court"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> All court cases
        </Link>
      }
    >
      <CourtRecord key={id} id={id} />
    </Page>
  );
}
