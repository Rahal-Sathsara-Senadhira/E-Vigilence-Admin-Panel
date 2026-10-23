// Contact details only — what an OIC or division supervisor can change.

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Alert, Button, Sheet } from "@/ui/index.js";
import { showErrors } from "../lib/form-errors.js";
import { ContactFields } from "./StationForm.jsx";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   station: import("../api.js").Station,
 *   onSubmit: (values: object) => Promise<unknown>,
 * }} props
 */
export function ContactForm({ open, onOpenChange, station, onSubmit }) {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      address: station.address ?? "",
      phone: station.phone ?? "",
      email: station.email ?? "",
    },
  });
  useEffect(() => {
    if (open)
      reset({
        address: station.address ?? "",
        phone: station.phone ?? "",
        email: station.email ?? "",
      });
  }, [open, station, reset]);

  const submit = handleSubmit(async (v) => {
    try {
      await onSubmit({
        address: v.address.trim() || undefined,
        phone: v.phone.trim() || undefined,
        email: v.email.trim() || undefined,
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
      title="Contact details"
      description={`How the public and other stations reach ${station.name}.`}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="contact-form" loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} noValidate className="grid gap-5 p-5">
        {errors.root?.message ? <Alert tone="danger">{errors.root.message}</Alert> : null}
        <ContactFields register={register} errors={errors} />
      </form>
    </Sheet>
  );
}
