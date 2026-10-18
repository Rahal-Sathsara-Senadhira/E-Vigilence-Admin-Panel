import React from "react";
import { uploadEvidenceFile, getEvidenceFile, discardEvidenceFile } from "../../../services/violationsApi";
import { evidenceKindOf, EVIDENCE_LIMIT_MB } from "../../../utils/complaint";

const MAX_FILES = 15;
const POLL_MS = 1500;

// Uploads each picked file right away (one request per file, with progress)
// and keeps the server's upload id; the complaint claims those ids on submit.
//
// Item status: "uploading" → (videos / long audio) "compressing" → "done",
// or "error". Compression happens on the server after the upload finishes;
// this polls it for progress.
export function useEvidenceUploads() {
  const [items, setItems] = React.useState([]);
  const aborts = React.useRef(new Map());
  const pollers = React.useRef(new Map());

  const update = (key, patch) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  // Latest list for event handlers — uploads are started here, never inside
  // a state updater (StrictMode runs updaters twice, which would upload
  // every file twice).
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  // Stop polling when the page goes away.
  React.useEffect(() => {
    const timers = pollers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  function pollUntilReady(key, uploadId) {
    const tick = async () => {
      pollers.current.delete(key);
      if (!itemsRef.current.some((it) => it.key === key)) return; // removed meanwhile
      try {
        const u = await getEvidenceFile(uploadId);
        if (u.status === "ready") update(key, { status: "done", progress: 1, upload: u });
        else if (u.status === "failed") update(key, { status: "error", error: u.error || "Processing failed" });
        else {
          update(key, { compressProgress: u.progress ?? 0 });
          pollers.current.set(key, setTimeout(tick, POLL_MS));
        }
      } catch {
        pollers.current.set(key, setTimeout(tick, POLL_MS * 2)); // transient — keep trying
      }
    };
    pollers.current.set(key, setTimeout(tick, POLL_MS));
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const room = Math.max(0, MAX_FILES - itemsRef.current.length);

    const next = files.slice(0, room).map((file) => {
      const key = crypto.randomUUID();
      const kind = evidenceKindOf(file);
      let error = null;
      if (!kind) error = "Not a photo, video or audio file";
      else if (file.size > EVIDENCE_LIMIT_MB[kind] * 1024 * 1024) {
        error = `Too large — ${kind.slice(0, -1)} files can be up to ${EVIDENCE_LIMIT_MB[kind]} MB`;
      }
      return {
        key,
        file,
        kind,
        status: error ? "error" : "uploading",
        progress: 0,
        compressProgress: 0,
        error,
        upload: null,
      };
    });
    itemsRef.current = [...itemsRef.current, ...next];
    setItems((current) => [...current, ...next]);

    for (const it of next) {
      if (it.status !== "uploading") continue;
      const { promise, abort } = uploadEvidenceFile(it.file, it.kind, (p) => update(it.key, { progress: p }));
      aborts.current.set(it.key, abort);
      promise
        .then((upload) => {
          if (upload.status === "processing") {
            update(it.key, { status: "compressing", progress: 1, upload });
            pollUntilReady(it.key, upload.id);
          } else {
            update(it.key, { status: "done", progress: 1, upload });
          }
        })
        .catch((err) => update(it.key, { status: "error", error: err.message }))
        .finally(() => aborts.current.delete(it.key));
    }
  }

  function remove(key) {
    const it = itemsRef.current.find((x) => x.key === key);
    aborts.current.get(key)?.();
    clearTimeout(pollers.current.get(key));
    pollers.current.delete(key);
    if (it?.upload?.id) discardEvidenceFile(it.upload.id).catch(() => {});
    setItems((list) => list.filter((x) => x.key !== key));
  }

  // Best-effort cleanup when the form is abandoned (the server also deletes
  // unclaimed uploads after a day).
  function discardAll() {
    for (const abort of aborts.current.values()) abort();
    for (const t of pollers.current.values()) clearTimeout(t);
    for (const it of itemsRef.current) if (it.upload?.id) discardEvidenceFile(it.upload.id).catch(() => {});
  }

  return {
    items,
    addFiles,
    remove,
    discardAll,
    uploading: items.some((it) => it.status === "uploading"),
    compressing: items.some((it) => it.status === "compressing"),
    busy: items.some((it) => it.status === "uploading" || it.status === "compressing"),
    failed: items.filter((it) => it.status === "error").length,
    uploadIds: items.filter((it) => it.status === "done").map((it) => it.upload.id),
  };
}
