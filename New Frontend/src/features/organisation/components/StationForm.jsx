// Add, edit or verify a station, in a side sheet. The position is set by
// clicking the map or dragging the pin (or typing the coordinates).
//   create  HQ adds a station — verified at once
//   edit    HQ changes any detail
//   verify  HQ confirms the division (the suggestion is pre-filled) and pin

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { StationMap } from "@/domain/map/index.jsx";
import { Alert, Button, Field, Input, Select, Sheet } from "@/ui/index.js";
import { useDivisions } from "../api.js";
import { showErrors } from "../lib/form-errors.js";

const coordinate = (/** @type {string} */ what) =>
  z.coerce.number({ error: `Enter the ${what}.` }).refine(Number.isFinite, `Enter the ${what}.`);

const schema = z.object({
  name: z.string().trim(),
  code: z.string().trim(),
  divisionId: z.string().min(1, "Choose the division."),
  lat: coordinate("latitude"),
  lng: coordinate("longitude"),
  address: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim(),
});

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   mode: "create" | "edit" | "verify",
 *   station?: import("../api.js").Station,
 *   onSubmit: (values: object) => Promise<unknown>,
 * }} props
 */
export function StationForm({ open, onOpenChange, mode, station, onSubmit }) {
  const divisions = useDivisions();
  const defaults = useMemo(
    () => ({
      name: station?.name ?? "",
      code: station?.code ?? "",
      divisionId: station?.division?.id ?? station?.suggestedDivision?.id ?? "",
      lat: station?.location?.lat ?? /** @type {any} */ (""),
      lng: station?.location?.lng ?? /** @type {any} */ (""),
      address: station?.address ?? "",
      phone: station?.phone ?? "",
      email: station?.email ?? "",
    }),
    [station],
  );
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (open) reset(defaults);
  }, [open, defaults, reset]);

  const [lat, lng] = useWatch({ control, name: ["lat", "lng"] });
  const pin =
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && lat !== "" && lng !== ""
      ? { lat: Number(lat), lng: Number(lng) }
      : null;

  const submit = handleSubmit(async (v) => {
    if (mode !== "verify" && v.name.length < 3) {
      setError("name", { type: "client", message: "Enter the station name." });
      return;
    }
    try {
      await onSubmit(
        mode === "verify"
          ? { divisionId: v.divisionId, lat: v.lat, lng: v.lng }
          : {
              name: v.name,
              code: v.code || undefined,
              divisionId: v.divisionId,
              lat: v.lat,
              lng: v.lng,
              address: v.address || undefined,
              phone: v.phone || undefined,
              email: v.email || undefined,
            },
      );
      onOpenChange(false);
    } catch (err) {
      showErrors(err, setError);
    }
  });

  const titles = {
    create: ["New station", "Added stations are verified at once."],
    edit: [`Edit ${station?.name ?? "station"}`, "Changes are recorded in the audit log."],
    verify: [
      `Verify ${station?.name ?? "station"}`,
      "Confirm the division and move the pin onto the station building if needed.",
    ],
  }[mode];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={titles[0]}
      description={titles[1]}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="station-form" loading={isSubmitting}>
            {mode === "verify"
              ? "Verify station"
              : mode === "create"
                ? "Add station"
                : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="station-form" onSubmit={submit} noValidate className="grid gap-5 p-5">
        {errors.root?.message ? <Alert tone="danger">{errors.root.message}</Alert> : null}

        {mode !== "verify" ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Station name" error={errors.name?.message}>
              {({ invalid, ...p }) => (
                <Input {...p} invalid={invalid} autoFocus {...register("name")} />
              )}
            </Field>
            <Field
              label="Code"
              hint={mode === "create" ? "Optional" : undefined}
              error={errors.code?.message}
            >
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  className="font-mono uppercase"
                  {...register("code")}
                />
              )}
            </Field>
          </div>
        ) : null}

        <Field
          label="Division"
          hint={
            mode === "verify" && station?.suggestedDivision
              ? `Suggested from the nearest division headquarters: ${station.suggestedDivision.name}. Check it.`
              : undefined
          }
          error={errors.divisionId?.message}
        >
          {({ invalid, ...p }) => (
            <Select {...p} invalid={invalid} {...register("divisionId")}>
              <option value="">Choose the division</option>
              {(divisions.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.province ? ` — ${d.province}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid gap-2">
          <p className="text-sm font-medium text-text">Position</p>
          <StationMap
            label="Station position — click the map or drag the pin"
            className="h-64 w-full overflow-hidden rounded-lg border border-border"
            pick={pin ?? undefined}
            onPick={(la, ln) => {
              setValue("lat", la, { shouldValidate: true });
              setValue("lng", ln, { shouldValidate: true });
            }}
          />
          <p className="text-[13px] text-text-muted">
            Click the map or drag the pin. Or type the coordinates:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" error={/** @type {string | undefined} */ (errors.lat?.message)}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  inputMode="decimal"
                  className="font-mono"
                  {...register("lat")}
                />
              )}
            </Field>
            <Field
              label="Longitude"
              error={/** @type {string | undefined} */ (errors.lng?.message)}
            >
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  inputMode="decimal"
                  className="font-mono"
                  {...register("lng")}
                />
              )}
            </Field>
          </div>
        </div>

        {mode !== "verify" ? (
          <fieldset className="grid gap-4">
            <legend className="mb-1 text-sm font-medium text-text">Contact</legend>
            <ContactFields register={register} errors={errors} />
          </fieldset>
        ) : null}
      </form>
    </Sheet>
  );
}

/**
 * Address, phone, email — shared with the contact-only form.
 * @param {{ register: any, errors: any }} props
 */
export function ContactFields({ register, errors }) {
  return (
    <>
      <Field label="Address" error={errors.address?.message}>
        {({ invalid, ...p }) => <Input {...p} invalid={invalid} {...register("address")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" error={errors.phone?.message}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} type="tel" {...register("phone")} />
          )}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} type="email" {...register("email")} />
          )}
        </Field>
      </div>
    </>
  );
}
