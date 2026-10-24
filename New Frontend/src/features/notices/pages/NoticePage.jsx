// One notice on its own page.

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { Page } from "@/ui/index.js";
import { NoticeRecord } from "../components/NoticeRecord.jsx";

export function NoticePage() {
  const { id = "" } = useParams();
  return (
    <Page
      title="Notice"
      className="max-w-[1100px]"
      back={
        <Link
          to="/notices"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> All notices
        </Link>
      }
    >
      <NoticeRecord key={id} id={id} />
    </Page>
  );
}
