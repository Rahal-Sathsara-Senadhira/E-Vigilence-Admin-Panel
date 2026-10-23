// Evidence on a report — docs/10 §3. Viewing copies inline; the original
// only for HQ, with a reason, and every step in the custody log.

import { formatBytes, type EvidenceView } from "@ev/shared";
import { Alert, Button, Dialog, EmptyState, Field, Skeleton, Spinner, Textarea } from "@ev/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Download,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  ListTree,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { apiBlob } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useCustody, useReportEvidence } from "../lib/reports";

function useObjectUrl(evidence: EvidenceView) {
  const ready = evidence.status !== "processing" && !!evidence.viewing;
  const blob = useQuery({
    queryKey: ["evidence-blob", evidence.id, evidence.status],
    queryFn: () => apiBlob(`/evidence/${evidence.id}/view`),
    enabled: ready,
    staleTime: Infinity,
  });
  const url = useMemo(() => (blob.data ? URL.createObjectURL(blob.data) : null), [blob.data]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return { url, loading: ready && !url, error: blob.error as Error | null };
}

function EvidenceTile({ item, onOpen }: { item: EvidenceView; onOpen: () => void }) {
  const { url, loading } = useObjectUrl(item);
  const Icon = item.kind === "photo" ? ImageIcon : item.kind === "video" ? FileVideo : FileAudio;
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface text-left outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative grid aspect-video place-items-center bg-raised">
        {item.status === "processing" ? (
          <span className="flex items-center gap-2 text-xs text-muted">
            <Spinner /> Preparing video
          </span>
        ) : item.kind === "photo" && url ? (
          <img src={url} alt={item.originalName} className="size-full object-cover" />
        ) : loading ? (
          <Skeleton className="size-full rounded-none" />
        ) : (
          <Icon className="size-8 text-muted" aria-hidden />
        )}
        {item.capturedInApp ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded bg-[#07182a]/75 px-1.5 py-0.5 text-[11px] text-white">
            <Smartphone className="size-3" /> In-app camera
          </span>
        ) : null}
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-ink">{item.originalName}</p>
        <p className="text-xs text-muted">
          {item.kind[0]!.toUpperCase() + item.kind.slice(1)} · {formatBytes(item.original.size)}
        </p>
      </div>
    </button>
  );
}

export function EvidenceGallery({ reportId }: { reportId: string }) {
  const evidence = useReportEvidence(reportId);
  if (evidence.isPending) return <Skeleton className="h-40" />;
  if (evidence.isError) return <Alert tone="danger">{(evidence.error as Error).message}</Alert>;
  if (evidence.data.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon className="size-5" />}
        title="No evidence"
        description="No photos, videos or recordings were sent with this report."
      />
    );
  }
  return <EvidenceList items={evidence.data} />;
}

/** Tiles that open a viewer with the fingerprint, custody log and (for HQ) the original. */
export function EvidenceList({ items }: { items: EvidenceView[] }) {
  const [open, setOpen] = useState<EvidenceView | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.map((item) => (
          <EvidenceTile key={item.id} item={item} onOpen={() => setOpen(item)} />
        ))}
      </div>
      {open ? <EvidenceDialog item={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function EvidenceDialog({ item, onClose }: { item: EvidenceView; onClose: () => void }) {
  const { allowed } = useAuth();
  const { url, loading, error } = useObjectUrl(item);
  const [showCustody, setShowCustody] = useState(false);
  const [askReason, setAskReason] = useState(false);
  const custody = useCustody(item.id, showCustody);

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={item.originalName}
      description={`Uploaded ${formatDateTime(item.uploadedAt)} by ${item.uploadedBy}${item.capturedInApp ? " · captured with the app camera" : ""}`}
      footer={
        <>
          <Button icon={<ListTree className="size-4" />} onClick={() => setShowCustody((v) => !v)}>
            {showCustody ? "Hide custody log" : "Custody log"}
          </Button>
          {allowed("evidence.viewOriginal") ? (
            <Button icon={<Download className="size-4" />} onClick={() => setAskReason(true)}>
              Download original
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid min-h-48 place-items-center overflow-hidden rounded-lg bg-[#07182a]">
          {error ? (
            <p className="p-6 text-sm text-white">{error.message}</p>
          ) : item.status === "processing" ? (
            <p className="flex items-center gap-2 p-6 text-sm text-white">
              <Spinner /> The video is being prepared for viewing.
            </p>
          ) : loading || !url ? (
            <Spinner className="text-white" />
          ) : item.kind === "photo" ? (
            <img src={url} alt={item.originalName} className="max-h-[60vh] w-auto" />
          ) : item.kind === "video" ? (
            <video src={url} controls className="max-h-[60vh] w-full" />
          ) : (
            <audio src={url} controls className="m-6 w-[90%]" />
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Original</dt>
            <dd className="text-ink">
              {formatBytes(item.original.size)} · {item.original.mime}
              {item.original.retained ? "" : " · not retained"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Viewing copy</dt>
            <dd className="text-ink">
              {item.viewing
                ? `${formatBytes(item.viewing.size)}${item.viewing.compressed ? " · compressed" : " · same as original"}`
                : "Preparing"}
              {item.status === "failed" ? " · compression failed, original shown" : ""}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="flex items-center gap-1.5 text-muted">
              <ShieldCheck className="size-4 text-success" aria-hidden /> SHA-256 fingerprint of the
              original
            </dt>
            <dd className="font-mono text-xs break-all text-ink">{item.original.sha256}</dd>
          </div>
        </dl>

        {showCustody ? (
          custody.isPending ? (
            <Skeleton className="h-24" />
          ) : custody.isError ? (
            <Alert tone="danger">{(custody.error as Error).message}</Alert>
          ) : (
            <ol className="space-y-3 border-l-2 border-line pl-4">
              {custody.data.map((c, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium text-ink">
                    {CUSTODY_LABELS[c.event] ?? c.event}{" "}
                    <span className="font-normal text-muted">· {c.actor}</span>
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(c.at)}</p>
                  {c.reason ? <p className="text-xs text-ink">Reason: {c.reason}</p> : null}
                  {c.detail ? <p className="text-xs break-all text-muted">{c.detail}</p> : null}
                </li>
              ))}
            </ol>
          )
        ) : null}
      </div>
      {askReason ? <OriginalDialog item={item} onClose={() => setAskReason(false)} /> : null}
    </Dialog>
  );
}

const CUSTODY_LABELS: Record<string, string> = {
  received: "Received",
  processed: "Viewing copy made",
  attached: "Attached to report",
  original_accessed: "Original opened",
  deleted: "Deleted",
  integrity_checked: "Integrity checked",
};

function OriginalDialog({ item, onClose }: { item: EvidenceView; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const download = useMutation({
    mutationFn: () =>
      apiBlob(`/evidence/${item.id}/original`, { method: "POST", body: { reason } }),
    onSuccess: (blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `evidence-${item.id}-original`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      toast.success("Original downloaded. The access is recorded in the custody log.");
      onClose();
    },
    onError: (err) => toast.error((err as Error).message),
  });
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title="Download the original"
      description="Opening an original is recorded with your name and reason in the custody log and the audit log."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={reason.trim().length < 5}
            loading={download.isPending}
            onClick={() => download.mutate()}
          >
            Download
          </Button>
        </>
      }
    >
      <Field label="Reason" hint="For example: preparing the court bundle.">
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}
