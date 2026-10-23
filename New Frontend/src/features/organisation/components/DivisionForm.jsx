// Add or edit a territorial division.

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Field, Input, Sheet } from "@/ui/index.js";
import { showErrors } from "../lib/form-errors.js";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   division?: import("../api.js").Division,
 *   onSubmit: (values: object) => Promise<unknown>,
 * }} props
 */
export function DivisionForm({ open, onOpenChange, division, onSubmit }) {
  const blank = {
    name: division?.name ?? "",
    code: division?.code ?? "",
    range: division?.range ?? "",
    province: division?.province ?? "",
  };
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: blank });
  useEffect(() => {
    if (open) reset(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, division]);

  const submit = handleSubmit(async (v) => {
    try {
      await onSubmit({
        name: v.name.trim(),
        code: v.code.trim(),
        range: v.range.trim() || undefined,
        province: v.province.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      showErrors(err, setError);
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={division ? `Edit ${division.name}` : "New division"}
      description="A territorial police division (SSP/SP area)."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="division-form" loading={isSubmitting}>
            {division ? "Save changes" : "Add division"}
          </Button>
        </>
      }
    >
      <form id="division-form" onSubmit={submit} noValidate className="grid gap-5 p-5">
        {errors.root?.message ? <Alert tone="danger">{errors.root.message}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Name" error={errors.name?.message}>
            {({ invalid, ...p }) => (
              <Input {...p} invalid={invalid} autoFocus {...register("name")} />
            )}
          </Field>
          <Field label="Code" error={errors.code?.message}>
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
        <Field label="Range" hint="e.g. Kandy & Matale Range" error={errors.range?.message}>
          {({ invalid, ...p }) => <Input {...p} invalid={invalid} {...register("range")} />}
        </Field>
        <Field label="Province" error={errors.province?.message}>
          {({ invalid, ...p }) => <Input {...p} invalid={invalid} {...register("province")} />}
        </Field>
      </form>
    </Sheet>
  );
}
