import React from "react";
import { UploadCloud, Image, Video, Music, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { FormSection } from "./formUi";
import { EVIDENCE_LIMIT_MB, formatBytes } from "../../../utils/complaint";

const KIND_ICON = { images: Image, videos: Video, audios: Music };
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/mpeg,video/x-msvideo,audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/mp4";

export default function EvidenceSection({ evidence }) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef(null);
  const done = evidence.items.filter((i) => i.status === "done").length;

  return (
    <FormSection
      id="evidence"
      step={6}
      title="Evidence"
      subtitle="Optional now — but a complaint can't be verified (or fined) without at least one file."
      complete={done > 0 && !evidence.uploading && evidence.failed === 0}
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          evidence.addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-line bg-raised/50"
        }`}
      >
        <UploadCloud className="h-8 w-8 text-muted" />
        <p className="mt-2 text-sm font-medium text-ink">Drag photos, videos or voice notes here</p>
        <p className="mt-0.5 text-xs text-muted">
          Photos up to {EVIDENCE_LIMIT_MB.images} MB · videos up to {EVIDENCE_LIMIT_MB.videos} MB · audio up to{" "}
          {EVIDENCE_LIMIT_MB.audios} MB
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Videos and long recordings are compressed automatically after upload.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            evidence.addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {evidence.items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {evidence.items.map((it) => {
            const Icon = KIND_ICON[it.kind] || AlertCircle;
            return (
              <li
                key={it.key}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  it.status === "error" ? "border-st-rejected/40 bg-st-rejected/5" : "border-line bg-surface"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.file.name}</p>
                  {it.status === "uploading" || it.status === "compressing" ? (
                    <>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
                        aria-label={it.status === "uploading" ? "Upload progress" : "Compression progress"}
                      >
                        <div
                          className={`h-full rounded-full transition-[width] ${
                            it.status === "uploading" ? "bg-primary" : "bg-st-review"
                          }`}
                          style={{
                            width: `${Math.round((it.status === "uploading" ? it.progress : it.compressProgress) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {it.status === "uploading"
                          ? `Uploading ${formatBytes(it.file.size)} · ${Math.round(it.progress * 100)}%`
                          : `Compressing · ${Math.round(it.compressProgress * 100)}%`}
                      </p>
                    </>
                  ) : it.status === "error" ? (
                    <p className="text-xs text-st-rejected">{it.error}</p>
                  ) : it.upload?.compressed ? (
                    <p className="text-xs text-muted">
                      {formatBytes(it.upload.originalSize)} →{" "}
                      <span className="font-semibold text-st-verified">{formatBytes(it.upload.size)}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted">{formatBytes(it.file.size)}</p>
                  )}
                </div>
                {it.status === "uploading" || it.status === "compressing" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Processing" />
                ) : it.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-st-verified" aria-label="Uploaded" />
                ) : null}
                <button
                  type="button"
                  onClick={() => evidence.remove(it.key)}
                  aria-label={`Remove ${it.file.name}`}
                  className="rounded-lg p-1.5 text-muted hover:bg-raised hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </FormSection>
  );
}
