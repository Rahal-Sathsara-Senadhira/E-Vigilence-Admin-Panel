import React from "react";
import { uploadEvidenceFile, discardEvidenceFile } from "../../../services/violationsApi";
import { evidenceKindOf, EVIDENCE_LIMIT_MB } from "../../../utils/complaint";

const MAX_FILES = 15;

// Uploads each picked file right away (one request per file, with progress)
// and keeps the server's upload id; the complaint claims those ids on submit.
export function useEvidenceUploads() {
  const [items, setItems] = React.useState([]);
  const aborts = React.useRef(new Map());

  const update = (key, patch) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  // Latest list for event handlers — uploads are started here, never inside
  // a state updater (StrictMode runs updaters twice, which would upload
  // every file twice).
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  function addFiles(fileList) {
    const files = Array.from(fileList || []);
    const room = Math.max(0, MAX_FILES - itemsRef.current.length);

    const next = files.slice(0, room).map((file) => {
      const key = crypto.randomUUID();
      const kind = evidenceKindOf(file);
      let error = null;
      if (!kind) error = "Not a photo, video or audio file";
      else if (file.size > EVIDENCE_LIMIT_MB[kind] * 1024 * 1024) {
        error = `Too large — ${kind.slice(0, -1)}s can be up to ${EVIDENCE_LIMIT_MB[kind]} MB`;
      }
      return { key, file, kind, status: error ? "error" : "uploading", progress: 0, error, upload: null };
    });
    itemsRef.current = [...itemsRef.current, ...next];
    setItems((current) => [...current, ...next]);

    for (const it of next) {
      if (it.status !== "uploading") continue;
      const { promise, abort } = uploadEvidenceFile(it.file, it.kind, (p) => update(it.key, { progress: p }));
      aborts.current.set(it.key, abort);
      promise
        .then((upload) => update(it.key, { status: "done", progress: 1, upload }))
        .catch((err) => update(it.key, { status: "error", error: err.message }))
        .finally(() => aborts.current.delete(it.key));
    }
  }

  function remove(key) {
    const it = items.find((x) => x.key === key);
    aborts.current.get(key)?.();
    if (it?.upload?.id) discardEvidenceFile(it.upload.id).catch(() => {});
    setItems((list) => list.filter((x) => x.key !== key));
  }

  // Best-effort cleanup when the form is abandoned (the server also deletes
  // unclaimed uploads after a day).
  function discardAll() {
    for (const abort of aborts.current.values()) abort();
    for (const it of itemsRef.current) if (it.upload?.id) discardEvidenceFile(it.upload.id).catch(() => {});
  }

  return {
    items,
    addFiles,
    remove,
    discardAll,
    uploading: items.some((it) => it.status === "uploading"),
    failed: items.filter((it) => it.status === "error").length,
    uploadIds: items.filter((it) => it.status === "done").map((it) => it.upload.id),
  };
}
