// Set a station's area of responsibility from a GeoJSON file (exported from
// QGIS, geojson.io or similar), or remove it. Drawing on the map comes later.

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Dialog } from "@/ui/index.js";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   hasArea: boolean,
 *   onSave: (area: any) => Promise<unknown>,
 * }} props
 */
export function AreaDialog({ open, onOpenChange, hasArea, onSave }) {
  const input = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);

  /** @param {any} area */
  async function save(area) {
    setBusy(true);
    setError(null);
    try {
      await onSave(area);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof ApiError && err.fields.area
          ? err.fields.area
          : err instanceof Error
            ? err.message
            : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /** @param {File} file */
  async function upload(file) {
    if (file.size > 2_000_000) {
      setError("The file is larger than 2 MB. Simplify the outline and try again.");
      return;
    }
    try {
      await save(JSON.parse(await file.text()));
    } catch (err) {
      if (err instanceof SyntaxError) setError("This file isn't valid GeoJSON.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setError(null);
        onOpenChange(o);
      }}
      title="Area of responsibility"
      description="Cases are dispatched to the station whose area contains the location. Upload the area as a GeoJSON file with one polygon."
      footer={
        <>
          {hasArea ? (
            <Button variant="danger" loading={busy} onClick={() => save(null)}>
              Remove area
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            icon={<FileUp className="size-4" />}
            onClick={() => input.current?.click()}
          >
            Choose file
          </Button>
        </>
      }
    >
      <input
        ref={input}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />
      <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
        <li>A Polygon or MultiPolygon, or a file with exactly one such feature.</li>
        <li>Coordinates in longitude, latitude order (the GeoJSON standard).</li>
        <li>Inside Sri Lanka, with no outline crossing itself.</li>
      </ul>
      {error ? (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      ) : null}
    </Dialog>
  );
}
