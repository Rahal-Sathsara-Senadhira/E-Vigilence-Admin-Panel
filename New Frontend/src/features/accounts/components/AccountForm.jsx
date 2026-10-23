// Create or edit an account, in a side sheet (docs/18 §7). The role decides
// which place is asked for: a station, a division, or none (national).

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Field, Input, Select, Sheet, Spinner } from "@/ui/index.js";
import { useAccountOptions } from "../api.js";

const schema = z
  .object({
    name: z.string().trim().min(3, "Enter the full name."),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.")]),
    serviceNumber: z.string().trim(),
    phone: z.string().trim(),
    role: z.string().min(1, "Choose a role."),
    stationId: z.string(),
    divisionId: z.string(),
  })
  .refine((v) => v.email || v.serviceNumber, {
    message: "Enter an email address or a service number — one is needed to sign in.",
    path: ["email"],
  });

/** @typedef {z.infer<typeof schema>} Values */

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   account?: import("../api.js").Account,
 *   onSubmit: (values: object) => Promise<unknown>,
 * }} props
 */
export function AccountForm({ open, onOpenChange, account, onSubmit }) {
  const options = useAccountOptions(open);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: blank(account),
  });

  useEffect(() => {
    if (open) reset(blank(account));
  }, [open, account, reset]);

  const role = useWatch({ control, name: "role" });
  const roleInfo = options.data?.roles.find((r) => r.key === role);
  const level = roleInfo?.level ?? account?.level;
  const onlyStation = options.data?.stations.length === 1 ? options.data.stations[0] : null;

  // An OIC has one station to choose: fill it in.
  useEffect(() => {
    if (level === "station" && onlyStation) setValue("stationId", onlyStation.id);
  }, [level, onlyStation, setValue]);

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        name: values.name,
        email: values.email || undefined,
        serviceNumber: values.serviceNumber || undefined,
        phone: values.phone || undefined,
        role: values.role,
        stationId: level === "station" ? values.stationId || undefined : undefined,
        divisionId: level === "division" ? values.divisionId || undefined : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        for (const [field, message] of Object.entries(err.fields)) {
          setError(/** @type {keyof Values} */ (field), { type: "server", message });
        }
      } else {
        setError("root", { message: err instanceof Error ? err.message : "Please try again." });
      }
    }
  });

  const editing = Boolean(account);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${account?.name}` : "New account"}
      description={
        editing
          ? "Changing the role or place signs the person out so their new access applies."
          : "The person gets a temporary password and chooses their own at their first sign-in."
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="account-form" loading={isSubmitting}>
            {editing ? "Save changes" : "Create account"}
          </Button>
        </>
      }
    >
      {options.isPending ? (
        <div className="flex items-center gap-2 p-5 text-sm text-text-muted">
          <Spinner /> Loading
        </div>
      ) : options.isError ? (
        <div className="p-5">
          <Alert tone="danger">{options.error.message}</Alert>
        </div>
      ) : (
        <form id="account-form" onSubmit={submit} noValidate className="grid gap-5 p-5">
          {errors.root?.message ? <Alert tone="danger">{errors.root.message}</Alert> : null}
          <Field label="Full name" error={errors.name?.message}>
            {({ invalid, ...p }) => (
              <Input {...p} invalid={invalid} autoComplete="off" autoFocus {...register("name")} />
            )}
          </Field>

          <fieldset className="grid gap-4">
            <legend className="mb-1 text-sm font-medium text-text">Signs in with</legend>
            <Field label="Email address" error={errors.email?.message}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  type="email"
                  autoComplete="off"
                  {...register("email")}
                />
              )}
            </Field>
            <Field
              label="Police service number"
              hint="Optional for civilian staff."
              error={errors.serviceNumber?.message}
            >
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono uppercase"
                  {...register("serviceNumber")}
                />
              )}
            </Field>
          </fieldset>

          <Field label="Phone (optional)" error={errors.phone?.message}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                type="tel"
                autoComplete="off"
                {...register("phone")}
              />
            )}
          </Field>

          <Field label="Role" error={errors.role?.message}>
            {({ invalid, ...p }) => (
              <Select {...p} invalid={invalid} {...register("role")}>
                <option value="">Choose a role</option>
                {options.data.roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {level === "station" ? (
            <Field label="Station" error={errors.stationId?.message}>
              {({ invalid, ...p }) => (
                <Select {...p} invalid={invalid} {...register("stationId")}>
                  <option value="">Choose a station</option>
                  {options.data.stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          {level === "division" ? (
            <Field label="Division" error={errors.divisionId?.message}>
              {({ invalid, ...p }) => (
                <Select {...p} invalid={invalid} {...register("divisionId")}>
                  <option value="">Choose a division</option>
                  {options.data.divisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}

          {level === "national" ? (
            <p className="text-[13px] text-text-muted">
              A national role works across all of Sri Lanka and needs two-step sign-in.
            </p>
          ) : null}
        </form>
      )}
    </Sheet>
  );
}

/** @param {import("../api.js").Account} [a] @returns {Values} */
function blank(a) {
  return {
    name: a?.name ?? "",
    email: a?.email ?? "",
    serviceNumber: a?.serviceNumber ?? "",
    phone: a?.phone ?? "",
    role: a?.role ?? "",
    stationId: a?.station?.id ?? "",
    divisionId: a?.level === "division" ? (a?.division?.id ?? "") : "",
  };
}
