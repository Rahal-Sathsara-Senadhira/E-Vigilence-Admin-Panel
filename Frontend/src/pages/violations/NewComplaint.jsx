// src/pages/violations/NewComplaint.jsx
//
// Staff complaint intake (HQ, and station staff for walk-ins). Rules mirror
// the backend's validateStaffComplaint; see VIOLATIONS_BUSINESS_LOGIC.md and
// Backend/src/modules/violations/violations.controller.js#createComplaint.
import React from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";

import Modal from "../../components/ui/Modal";
import { listViolationCatalog } from "../../services/violationCatalogApi";
import { getNearestStation } from "../../services/policeStationsApi";
import { createComplaint, checkDuplicates } from "../../services/violationsApi";
import { getUser } from "../../utils/auth";
import { isStationRole } from "../../utils/roles";
import { showToast } from "../../utils/toastBus";

import { useComplaintForm } from "./new/useComplaintForm";
import SourceSection from "./new/SourceSection";
import IncidentSection from "./new/IncidentSection";
import VehicleSection from "./new/VehicleSection";
import OffencesSection from "./new/OffencesSection";
import LocationSection from "./new/LocationSection";
import EvidenceSection from "./new/EvidenceSection";
import { useEvidenceUploads } from "./new/useEvidenceUploads";
import SummaryPanel from "./new/SummaryPanel";

const SECTION_ORDER = ["source", "incident", "vehicle", "offences", "location"];

export default function NewComplaint() {
  const nav = useNavigate();
  const isStation = isStationRole(getUser()?.role);

  const [catalog, setCatalog] = React.useState([]);
  const [catalogError, setCatalogError] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    listViolationCatalog()
      .then((rows) => !cancelled && setCatalog(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setCatalogError("Couldn't load the Violation Catalog — refresh to try again."));
    return () => {
      cancelled = true;
    };
  }, []);

  const f = useComplaintForm(catalog);
  const evidence = useEvidenceUploads();
  const { form } = f;

  // Nearest station for the pin — from the backend, the same lookup
  // "Create & dispatch" uses.
  const [nearestStation, setNearestStation] = React.useState(null);
  React.useEffect(() => {
    if (!form.location) {
      setNearestStation(null);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      getNearestStation(form.location.lat, form.location.lng)
        .then((s) => !cancelled && setNearestStation(s))
        .catch(() => !cancelled && setNearestStation(null));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.location]);

  // Possible duplicates, checked while the form is filled in.
  const [duplicates, setDuplicates] = React.useState([]);
  const firstOffence = form.violations[0] || null;
  React.useEffect(() => {
    if (!f.plate && !(firstOffence && form.location)) {
      setDuplicates([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      checkDuplicates({
        vehicleNumber: f.plate,
        violations: firstOffence ? [firstOffence] : [],
        location: form.location,
      })
        .then((r) => !cancelled && setDuplicates(r?.matches || []))
        .catch(() => !cancelled && setDuplicates([]));
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [f.plate, firstOffence, form.location]);

  // Leaving with unsaved changes: browser close/reload…
  const submittedRef = React.useRef(false);
  const dirty = f.isDirty || evidence.items.length > 0;
  React.useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // …and navigating elsewhere in the app.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !submittedRef.current && currentLocation.pathname !== nextLocation.pathname
  );

  // One key per form: a retried submit (double click, flaky network) gets
  // the same complaint back instead of creating a second one.
  const idempotencyKey = React.useRef(crypto.randomUUID());
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");

  async function submit(dispatch) {
    f.setShowErrors(true);
    setSubmitError("");

    if (!f.isValid) {
      const first = SECTION_ORDER.find((s) => !f.sectionComplete[s]);
      if (first) document.getElementById(first)?.scrollIntoView({ behavior: "smooth", block: "start" });
      showToast("Some details are missing — check the highlighted fields", "error");
      return;
    }
    if (evidence.busy) return; // still uploading or compressing

    try {
      setSubmitting(true);
      const created = await createComplaint(
        { ...f.toPayload(), evidenceIds: evidence.uploadIds, dispatch: dispatch || undefined },
        idempotencyKey.current
      );
      submittedRef.current = true;

      const id = created?.id || created?._id;
      if (created?.dispatch?.stationName) {
        showToast(`Complaint created and sent to ${created.dispatch.stationName}`, "success");
      } else if (created?.dispatch?.error) {
        showToast(`Complaint created, but dispatch failed: ${created.dispatch.error}`, "warning");
      } else {
        showToast("Complaint created", "success");
      }

      nav(isStation ? "/station/assigned" : `/violations/${id}`);
    } catch (err) {
      setSubmitError(err.message || "Couldn't create the complaint");
    } finally {
      setSubmitting(false);
    }
  }

  const sectionProps = { form, set: f.set, errors: f.visibleErrors };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        Record a complaint received by phone, at the counter, or observed by an officer. Fields marked{" "}
        <span className="text-st-rejected">*</span> are required.
      </p>

      {submitError ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-st-rejected/40 bg-st-rejected/10 p-4 text-sm text-ink"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-st-rejected" />
          <span>{submitError}</span>
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <SourceSection {...sectionProps} complete={f.sectionComplete.source} />
          <IncidentSection {...sectionProps} complete={f.sectionComplete.incident} />
          <VehicleSection {...sectionProps} complete={f.sectionComplete.vehicle} />
          <OffencesSection
            {...sectionProps}
            complete={f.sectionComplete.offences}
            catalog={catalog}
            catalogById={f.catalogById}
            loadError={catalogError}
          />
          <LocationSection
            {...sectionProps}
            complete={f.sectionComplete.location}
            nearestStation={nearestStation}
          />
          <EvidenceSection evidence={evidence} />
        </div>

        <SummaryPanel
          f={f}
          evidence={evidence}
          nearestStation={nearestStation}
          duplicates={duplicates}
          isStation={isStation}
          submitting={submitting}
          onSubmit={submit}
        />
      </div>

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        maxWidth="max-w-md"
      >
        <p className="text-sm text-muted">
          This complaint hasn't been created yet. If you leave now, what you've entered — and any uploaded
          evidence — will be discarded.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => blocker.reset?.()}
            className="h-10 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => {
              evidence.discardAll();
              blocker.proceed?.();
            }}
            className="h-10 rounded-xl bg-st-rejected px-4 text-sm font-semibold text-white hover:brightness-110"
          >
            Discard and leave
          </button>
        </div>
      </Modal>
    </div>
  );
}
