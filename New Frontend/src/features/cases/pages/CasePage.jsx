// One case on its own page (phones, links, search).

import { ArrowLeft } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Page } from "@/ui/index.js";
import { CaseRecord } from "../components/CaseRecord.jsx";

export function CasePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  return (
    <Page
      title="Case"
      className="max-w-[1100px]"
      back={
        <Link
          to="/cases"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> All cases
        </Link>
      }
    >
      <CaseRecord key={id} id={id} onGone={() => navigate("/inbox", { replace: true })} />
    </Page>
  );
}
