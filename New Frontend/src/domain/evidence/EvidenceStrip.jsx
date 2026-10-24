// Evidence on a report or case — docs/10 §3. Viewing copies are fetched with the
// sign-in token and shown from memory (no browser cache). Each item shows
// its fingerprint; originals are opened elsewhere, with a reason.

import { FileAudio, FileVideo, ImageOff, Paperclip, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiBlob } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Button, Dialog, Skeleton, cn } from "@/ui/index.js";

/** A viewing copy as an object URL, revoked when no longer shown. @param {string | null} id */
function useEvidenceUrl(id) {
  const [state, setState] = useState(
    /** @type {{ url: string | null, failed: boolean }} */ ({ url: null, failed: false }),
  );
  useEffect(() => {
    if (!id) return undefined;
    let url = /** @type {string | null} */ (null);
    const controller = new AbortController();
    apiBlob(`/evidence/${id}/view`, { signal: controller.signal })
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setState({ url, failed: false });
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setState({ url: null, failed: true });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state;
}

/**
 * @typedef {object} Item
 * @property {string} id
 * @property {"photo" | "video" | "audio"} kind
 * @property {string} mime
 * @property {number} size
 * @property {string} sha256
 * @property {string | null} originalName
 * @property {string | null} uploadedBy
 * @property {string} uploadedAt
 * @property {boolean | null} [capturedInApp]
 * @property {string | null} [capturedAt]
 */

/** @param {{ item: Item, onOpen: () => void }} props */
function Thumb({ item, onOpen }) {
  const { url, failed } = useEvidenceUrl(item.kind === "photo" ? item.id : null);
  const Icon = item.kind === "video" ? FileVideo : FileAudio;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-sunken focus-visible:outline-2"
      aria-label={`Open ${item.kind}${item.originalName ? ` ${item.originalName}` : ""}`}
    >
      {item.kind === "photo" ? (
        failed ? (
          <ImageOff className="m-auto size-6 text-text-muted" aria-hidden />
        ) : url ? (
          <img
            src={url}
            alt=""
            className="size-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <Skeleton className="size-full rounded-none" />
        )
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1 text-text-muted">
          <Icon className="size-6" aria-hidden />
          <span className="text-xs capitalize">{item.kind}</span>
        </span>
      )}
      {item.capturedInApp === false ? (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[11px] text-white">
          From gallery
        </span>
      ) : null}
    </button>
  );
}

/** @param {{ item: Item | null, onClose: () => void }} props */
function Viewer({ item, onClose }) {
  const { url, failed } = useEvidenceUrl(item?.id ?? null);
  if (!item) return null;
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={item.originalName ?? `Evidence (${item.kind})`}
    >
      <div className="grid gap-3">
        <div className="grid min-h-48 place-items-center overflow-hidden rounded-lg bg-black">
          {failed ? (
            <p className="p-6 text-sm text-white/80">This file couldn&apos;t be loaded.</p>
          ) : !url ? (
            <Skeleton className="h-64 w-full rounded-none" />
          ) : item.kind === "photo" ? (
            <img src={url} alt="Evidence" className="max-h-[60dvh] w-auto object-contain" />
          ) : item.kind === "video" ? (
            <video src={url} controls className="max-h-[60dvh] w-full" />
          ) : (
            <audio src={url} controls className="w-full p-6" />
          )}
        </div>
        <dl className="grid gap-1 text-xs text-text-muted">
          <div>
            Uploaded {formatDateTime(item.uploadedAt)}
            {item.uploadedBy ? ` by ${item.uploadedBy}` : ""} ·{" "}
            {Math.ceil(item.size / 1024).toLocaleString()} KB
          </div>
          {item.capturedInApp !== null ? (
            <div>
              {item.capturedInApp
                ? "Taken with the mobile app's camera"
                : "Picked from the phone's gallery — not taken in the app"}
              {item.capturedAt ? `, ${formatDateTime(item.capturedAt)}` : ""}
            </div>
          ) : null}
          <div className="break-all">
            Fingerprint (SHA-256): <span className="font-mono">{item.sha256}</span>
          </div>
        </dl>
      </div>
    </Dialog>
  );
}

/**
 * @param {{ items: Item[], upload?: import("@tanstack/react-query").UseMutationResult<any, Error, File> | null }} props
 *   upload: how a new file is added; none → read only
 */
export function EvidenceStrip({ items, upload }) {
  const [open, setOpen] = useState(/** @type {Item | null} */ (null));
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));

  return (
    <div>
      {items.length ? (
        <ul className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4")}>
          {items.map((item) => (
            <li key={item.id}>
              <Thumb item={item} onOpen={() => setOpen(item)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Paperclip className="size-4" aria-hidden /> No evidence attached.
        </p>
      )}
      {upload ? (
        <div className="mt-3">
          <input
            ref={input}
            type="file"
            accept="image/*,video/*,audio/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
          <Button
            size="sm"
            loading={upload.isPending}
            icon={<Upload className="size-4" />}
            onClick={() => input.current?.click()}
          >
            Add evidence
          </Button>
          {upload.isError ? (
            <Alert tone="danger" className="mt-2">
              {
                /** @type {any} */ (upload.error)?.fields?.file ??
                  (upload.error instanceof Error ? upload.error.message : "Upload failed.")
              }
            </Alert>
          ) : null}
        </div>
      ) : null}
      <Viewer item={open} onClose={() => setOpen(null)} />
    </div>
  );
}
