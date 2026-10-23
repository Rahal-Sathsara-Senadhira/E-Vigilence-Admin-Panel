// Record a report — docs/02 §3, §7. HQ records WhatsApp and phone reports
// (they go to the triage queue); stations record walk-in, phone and
// officer-observed reports (a case opens at once, or after a second officer).

import {
  CHANNEL_LABELS,
  EVIDENCE_MAX_FILES,
  HQ_ENTRY_CHANNELS,
  STATION_ENTRY_CHANNELS,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  formatBytes,
  type EvidenceView,
  type ReportDetail,
  type VehicleType,
} from "@ev/shared";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  cn,
} from "@ev/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, FileUp, Phone, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useCurrentUser } from "../../auth/AuthProvider";
import {
  OffencePicker,
  fromLocalInput,
  parseCoordinates,
  toLocalInput,
} from "../../components/reportFields";
import { ApiError, api, apiUpload } from "../../lib/api";
import { useOffences } from "../../lib/reports";

interface Upload {
  key: string;
  file: File;
  progress: number;
  status: "uploading" | "done" | "error";
  evidence?: EvidenceView;
  error?: string;
}

export function NewReportPage() {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const offences = useOffences();
  const atStation = me.role === "station_oic" || me.role === "station_officer";
  const channels = atStation ? STATION_ENTRY_CHANNELS : HQ_ENTRY_CHANNELS;

  const [channel, setChannel] = useState<(typeof channels)[number]>(channels[0]);
  const [reporterKind, setReporterKind] = useState<"named" | "anonymous">("named");
  const [reporterName, setReporterName] = useState("");
  const [reporterPhone, setReporterPhone] = useState("");
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInput(new Date(Date.now() - 30 * 60_000)),
  );
  const [coords, setCoords] = useState("");
  const [address, setAddress] = useState("");
  const [plateUnknown, setPlateUnknown] = useState(false);
  const [plate, setPlate] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [vehicleDescription, setVehicleDescription] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [someoneHurt, setSomeoneHurt] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const isOfficer = channel === "officer";
  const point = parseCoordinates(coords);
  const uploading = uploads.some((u) => u.status === "uploading");

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = EVIDENCE_MAX_FILES - uploads.length;
    for (const file of Array.from(files).slice(0, room)) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      setUploads((list) => [...list, { key, file, progress: 0, status: "uploading" }]);
      apiUpload<EvidenceView>(`/evidence?fileName=${encodeURIComponent(file.name)}`, file, (p) =>
        setUploads((list) => list.map((u) => (u.key === key ? { ...u, progress: p } : u))),
      )
        .then((evidence) =>
          setUploads((list) =>
            list.map((u) => (u.key === key ? { ...u, status: "done", progress: 1, evidence } : u)),
          ),
        )
        .catch((err: Error) =>
          setUploads((list) =>
            list.map((u) => (u.key === key ? { ...u, status: "error", error: err.message } : u)),
          ),
        );
    }
    if (files.length > room) toast.error(`Up to ${EVIDENCE_MAX_FILES} files per report.`);
  };

  const create = useMutation({
    mutationFn: () =>
      api<ReportDetail>("/reports", {
        method: "POST",
        body: {
          channel,
          reporter:
            isOfficer || reporterKind === "anonymous"
              ? { kind: "anonymous" }
              : { kind: "named", name: reporterName, phone: reporterPhone },
          occurredAt: fromLocalInput(occurredAt),
          location: point,
          address,
          plateUnknown,
          vehicleNumber: plateUnknown ? undefined : plate,
          vehicleType,
          vehicleDescription: vehicleDescription || undefined,
          offenceCodes: codes,
          description,
          evidenceIds: uploads.filter((u) => u.status === "done").map((u) => u.evidence!.id),
          someoneHurt,
        },
      }),
    onSuccess: (report) => {
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success(
        report.status === "accepted"
          ? `${report.reportNumber} recorded and a case opened.`
          : report.status === "pending_station"
            ? `${report.reportNumber} recorded — another officer or the OIC must accept it.`
            : `${report.reportNumber} recorded and sent to triage.`,
      );
      navigate(`/reports/${report.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      else toast.error((err as Error).message);
    },
  });

  return (
    <>
      <PageHeader
        title="Record a report"
        description={
          atStation ? `At ${me.stationName}.` : "WhatsApp and phone reports go to the triage queue."
        }
      />
      <div className="mb-6">
        <Alert tone="warning" title="If someone is in danger right now, call 119.">
          E-Vigilance is not an emergency service.
        </Alert>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFields({});
          create.mutate();
        }}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
      >
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="How it was reported" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Channel" error={fields.channel}>
                {(p) => (
                  <Select
                    {...p}
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as typeof channel)}
                  >
                    {channels.map((c) => (
                      <option key={c} value={c}>
                        {CHANNEL_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {isOfficer ? (
                <p className="self-end rounded-lg bg-raised p-3 text-sm text-muted sm:col-span-1">
                  You are recorded as the observing officer. Another officer or the OIC must accept
                  it.
                </p>
              ) : (
                <Field label="Reporter">
                  {(p) => (
                    <Select
                      {...p}
                      value={reporterKind}
                      onChange={(e) => setReporterKind(e.target.value as typeof reporterKind)}
                    >
                      <option value="named">Named</option>
                      <option value="anonymous">Anonymous</option>
                    </Select>
                  )}
                </Field>
              )}
              {!isOfficer && reporterKind === "named" ? (
                <>
                  <Field label="Reporter's name" error={fields["reporter.name"]}>
                    {(p) => (
                      <Input
                        {...p}
                        value={reporterName}
                        onChange={(e) => setReporterName(e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label="Reporter's phone"
                    hint="Kept confidential — never shown to the offender."
                    error={fields["reporter.phone"]}
                  >
                    {(p) => (
                      <Input
                        {...p}
                        type="tel"
                        placeholder="077 123 4567"
                        value={reporterPhone}
                        onChange={(e) => setReporterPhone(e.target.value)}
                      />
                    )}
                  </Field>
                </>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="What happened" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-medium text-ink">Offences</p>
                <OffencePicker
                  offences={offences.data ?? []}
                  value={codes}
                  onChange={setCodes}
                  invalid={!!fields.offenceCodes}
                />
                {fields.offenceCodes ? (
                  <p className="mt-1.5 text-[13px] text-danger">{fields.offenceCodes}</p>
                ) : null}
              </div>
              <Field
                label="When it happened"
                hint="Within the last 30 days."
                error={fields.occurredAt}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Location (latitude, longitude)"
                hint="Paste from a map app, e.g. 6.9344, 79.8428"
                error={
                  fields.location ?? (coords && !point ? "Enter a point in Sri Lanka." : undefined)
                }
              >
                {(p) => (
                  <Input
                    {...p}
                    className="font-mono"
                    value={coords}
                    onChange={(e) => setCoords(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Address or landmark" className="sm:col-span-2" error={fields.address}>
                {(p) => (
                  <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />
                )}
              </Field>
              <Field
                label="Description"
                hint="10 to 2000 characters."
                className="sm:col-span-2"
                error={fields.description}
              >
                {(p) => (
                  <Textarea
                    {...p}
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
                <input
                  type="checkbox"
                  checked={someoneHurt}
                  onChange={(e) => setSomeoneHurt(e.target.checked)}
                  className="size-4 accent-[var(--ev-primary)]"
                />
                Someone was hurt (makes it urgent — P1)
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader title="Vehicle" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Vehicle number" hint="e.g. WP CAB-1234" error={fields.vehicleNumber}>
                {(p) => (
                  <Input
                    {...p}
                    className="font-mono"
                    disabled={plateUnknown}
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Vehicle type">
                {(p) => (
                  <Select
                    {...p}
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  >
                    {VEHICLE_TYPES.map((v) => (
                      <option key={v} value={v}>
                        {VEHICLE_TYPE_LABELS[v]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={plateUnknown}
                  onChange={(e) => setPlateUnknown(e.target.checked)}
                  className="size-4 accent-[var(--ev-primary)]"
                />
                Plate unknown
              </label>
              <Field label="Make, model or colour (optional)" className="sm:col-span-2">
                {(p) => (
                  <Input
                    {...p}
                    value={vehicleDescription}
                    onChange={(e) => setVehicleDescription(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader
              title="Evidence"
              description={`Photos, videos or recordings — up to ${EVIDENCE_MAX_FILES} files.`}
            />
            <div className="space-y-3 p-5">
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/*,video/*,audio/*"
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                className="w-full"
                icon={<FileUp className="size-4" />}
                disabled={uploads.length >= EVIDENCE_MAX_FILES}
                onClick={() => fileInput.current?.click()}
              >
                Add files
              </Button>
              <p className="text-xs text-muted">
                Photos up to 25 MB, videos up to 500 MB, audio up to 100 MB. Originals are kept
                untouched.
              </p>
              {fields.evidenceIds ? (
                <p className="text-[13px] text-danger">{fields.evidenceIds}</p>
              ) : null}
              <ul className="space-y-2">
                {uploads.map((u) => (
                  <li key={u.key} className="rounded-lg border border-line p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-ink">{u.file.name}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {formatBytes(u.file.size)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${u.file.name}`}
                        disabled={u.status === "uploading"}
                        onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))}
                        className="rounded p-1 text-muted hover:bg-raised hover:text-ink disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {u.status === "error" ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-danger">
                        <CircleAlert className="size-3.5" /> {u.error}
                      </p>
                    ) : (
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised"
                        role="progressbar"
                        aria-valuenow={Math.round(u.progress * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            u.status === "done" ? "bg-success" : "bg-primary",
                          )}
                          style={{ width: `${Math.round(u.progress * 100)}%` }}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            {!isOfficer && reporterKind === "named" && reporterPhone ? (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Phone className="size-3.5" /> Read the report back to the reporter before saving.
              </p>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={create.isPending}
              disabled={uploading}
            >
              {uploading ? "Waiting for uploads…" : "Record report"}
            </Button>
            <Button className="w-full" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </Card>
        </aside>
      </form>
    </>
  );
}
