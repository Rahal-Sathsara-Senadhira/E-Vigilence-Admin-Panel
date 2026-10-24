// One payment on its own page.

import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { Page } from "@/ui/index.js";
import { PaymentRecord } from "../components/PaymentRecord.jsx";

export function PaymentPage() {
  const { id = "" } = useParams();
  return (
    <Page
      title="Payment"
      className="max-w-[1100px]"
      back={
        <Link
          to="/payments"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> All payments
        </Link>
      }
    >
      <PaymentRecord key={id} id={id} />
    </Page>
  );
}
