// Staff accounts — docs/01 §7. HQ manages every role except dev; dev manages
// all; an OIC manages traffic officers at their own station. The API enforces
// every rule; this page only offers what the role may do.

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ROLE_LABELS,
  STAFF_ROLES,
  canManageRole,
  changeRoleSchema,
  createUserSchema,
  isStationRole,
  reasonSchema,
  type StaffRole,
  type StaffUserView,
} from "@ev/shared";
import {
  Alert,
  Button,
  Card,
  Dialog,
  DropdownMenu,
  EmptyState,
  Field,
  Input,
  MenuItem,
  MenuSeparator,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Table,
  Tag,
  Td,
  Th,
  Tr,
  Textarea,
} from "@ev/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  KeyRound,
  MoreHorizontal,
  Plus,
  Search,
  ShieldOff,
  UserCheck,
  UserCog,
  UserX,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { useCurrentUser } from "../auth/AuthProvider";
import { ApiError, api } from "../lib/api";
import { formatDateTime, formatRelative } from "../lib/format";
import { useStations, useUsers } from "../lib/queries";

type Action =
  | { kind: "deactivate" | "reactivate" | "resetMfa"; user: StaffUserView }
  | { kind: "role"; user: StaffUserView }
  | { kind: "resetPassword"; user: StaffUserView };

export function AccountsPage() {
  const me = useCurrentUser();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState("true");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [issued, setIssued] = useState<{
    email: string;
    password: string;
    created: boolean;
  } | null>(null);

  const users = useUsers({ q, role, active, page });
  const isOic = me.role === "station_oic";
  const nationalAdmin = me.role === "hq" || me.role === "dev";
  const totalPages = users.data
    ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize))
    : 1;

  return (
    <>
      <PageHeader
        title={isOic ? "Your officers" : "Accounts"}
        description={
          isOic
            ? `Traffic officers at ${me.stationName}.`
            : "Staff accounts, roles and station postings."
        }
        actions={
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setCreating(true)}
          >
            {isOic ? "Add officer" : "New account"}
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              aria-label="Search by name or email"
              placeholder="Search by name or email"
              className="pl-9"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {!isOic ? (
            <Select
              aria-label="Role"
              className="sm:w-48"
              value={role}
              onChange={(e) => (setRole(e.target.value), setPage(1))}
            >
              <option value="">All roles</option>
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            aria-label="Status"
            className="sm:w-40"
            value={active}
            onChange={(e) => (setActive(e.target.value), setPage(1))}
          >
            <option value="true">Active</option>
            <option value="false">Deactivated</option>
            <option value="">All</option>
          </Select>
        </div>

        {users.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : users.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(users.error as Error).message}</Alert>
          </div>
        ) : users.data.items.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No accounts match"
            description="Change the filters, or create an account."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Role</Th>
                  <Th>Station</Th>
                  <Th>Last sign-in</Th>
                  <Th>Status</Th>
                  <Th className="w-12">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted">
                        {u.email} · NIC <span className="font-mono">{u.nicMasked}</span>
                      </p>
                    </Td>
                    <Td>
                      <Tag>{ROLE_LABELS[u.role]}</Tag>
                    </Td>
                    <Td className="text-muted">{u.stationName ?? "National"}</Td>
                    <Td>
                      <span title={formatDateTime(u.lastLoginAt)} className="text-muted">
                        {formatRelative(u.lastLoginAt)}
                      </span>
                    </Td>
                    <Td>
                      {u.active ? (
                        <StatusBadge family="good">Active</StatusBadge>
                      ) : (
                        <StatusBadge family="closed">Deactivated</StatusBadge>
                      )}
                    </Td>
                    <Td>
                      {u.id !== me.id && canManageRole(me.role, u.role) ? (
                        <DropdownMenu
                          trigger={
                            <button
                              aria-label={`Actions for ${u.name}`}
                              className="rounded-md p-1.5 text-muted hover:bg-raised hover:text-ink"
                            >
                              <MoreHorizontal className="size-5" />
                            </button>
                          }
                        >
                          {nationalAdmin ? (
                            <MenuItem
                              icon={<UserCog />}
                              onSelect={() => setAction({ kind: "role", user: u })}
                            >
                              Change role or station
                            </MenuItem>
                          ) : null}
                          <MenuItem
                            icon={<KeyRound />}
                            onSelect={() => setAction({ kind: "resetPassword", user: u })}
                          >
                            Reset password
                          </MenuItem>
                          {nationalAdmin && u.mfaEnabled ? (
                            <MenuItem
                              icon={<ShieldOff />}
                              onSelect={() => setAction({ kind: "resetMfa", user: u })}
                            >
                              Reset two-step sign-in
                            </MenuItem>
                          ) : null}
                          <MenuSeparator />
                          {u.active ? (
                            <MenuItem
                              tone="danger"
                              icon={<UserX />}
                              onSelect={() => setAction({ kind: "deactivate", user: u })}
                            >
                              Deactivate
                            </MenuItem>
                          ) : (
                            <MenuItem
                              icon={<UserCheck />}
                              onSelect={() => setAction({ kind: "reactivate", user: u })}
                            >
                              Reactivate
                            </MenuItem>
                          )}
                        </DropdownMenu>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-muted">
              <span className="tabular-nums">
                {users.data.total} account{users.data.total === 1 ? "" : "s"}
              </span>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span className="tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <Button size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Card>

      <CreateAccountDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(email, password) => setIssued({ email, password, created: true })}
      />
      {action?.kind === "role" ? (
        <ChangeRoleDialog user={action.user} onClose={() => setAction(null)} />
      ) : null}
      {action &&
      (action.kind === "deactivate" ||
        action.kind === "reactivate" ||
        action.kind === "resetMfa") ? (
        <ReasonDialog action={action} onClose={() => setAction(null)} />
      ) : null}
      {action?.kind === "resetPassword" ? (
        <ResetPasswordDialog
          user={action.user}
          onClose={() => setAction(null)}
          onIssued={(password) => {
            setAction(null);
            setIssued({ email: action.user.email, password, created: false });
          }}
        />
      ) : null}
      {issued ? <TemporaryPasswordDialog {...issued} onClose={() => setIssued(null)} /> : null}
    </>
  );
}

// ── Create ───────────────────────────────────────────────────────────────

type CreateIn = z.input<typeof createUserSchema>;
type CreateOut = z.output<typeof createUserSchema>;

function applyServerErrors<T extends Record<string, unknown>>(
  form: UseFormReturn<T, unknown, never> | UseFormReturn<T>,
  err: unknown,
) {
  if (err instanceof ApiError && Object.keys(err.fields).length) {
    for (const [field, message] of Object.entries(err.fields))
      (form as UseFormReturn<T>).setError(field as never, { message });
    return true;
  }
  return false;
}

function CreateAccountDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const roles = STAFF_ROLES.filter((r) => canManageRole(me.role, r));
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CreateIn, unknown, CreateOut>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      nic: "",
      phone: "",
      role: roles[0] ?? "station_officer",
      stationId: me.role === "station_oic" ? me.stationId : null,
    },
  });
  const role = useWatch({ control: form.control, name: "role" }) as StaffRole;
  const needsStation = isStationRole(role);
  const stations = useStations();

  const create = useMutation({
    mutationFn: (values: CreateOut) =>
      api<{ user: StaffUserView; temporaryPassword: string }>("/users", {
        method: "POST",
        body: { ...values, stationId: needsStation ? values.stationId : null },
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      form.reset();
      onClose();
      onCreated(res.user.email, res.temporaryPassword);
    },
    onError: (err) => {
      if (!applyServerErrors(form as never, err)) {
        const e = err as ApiError;
        if (e.code === "email_taken") form.setError("email", { message: e.message });
        else if (e.code === "nic_taken") form.setError("nic", { message: e.message });
        else setError(e.message);
      }
    },
  });

  const close = () => {
    setError(null);
    form.reset();
    onClose();
  };
  const errors = form.formState.errors;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      title={me.role === "station_oic" ? "Add an officer" : "New account"}
      description="The person gets a temporary password and must choose their own at first sign-in."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            onClick={form.handleSubmit((v) => create.mutate(v))}
          >
            Create account
          </Button>
        </>
      }
    >
      <form
        onSubmit={form.handleSubmit((v) => create.mutate(v))}
        noValidate
        className="grid gap-4 sm:grid-cols-2"
      >
        {error ? (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}
        <Field label="Full name" error={errors.name?.message} className="sm:col-span-2">
          {(p) => <Input {...p} autoComplete="off" {...form.register("name")} />}
        </Field>
        <Field label="Official email" error={errors.email?.message} className="sm:col-span-2">
          {(p) => <Input {...p} type="email" autoComplete="off" {...form.register("email")} />}
        </Field>
        <Field label="NIC number" hint="852345678V or 198523405678" error={errors.nic?.message}>
          {(p) => (
            <Input {...p} className="font-mono" autoComplete="off" {...form.register("nic")} />
          )}
        </Field>
        <Field label="Mobile (optional)" error={errors.phone?.message}>
          {(p) => (
            <Input {...p} type="tel" placeholder="077 123 4567" {...form.register("phone")} />
          )}
        </Field>
        {roles.length > 1 ? (
          <Field
            label="Role"
            error={errors.role?.message}
            className={needsStation ? "" : "sm:col-span-2"}
          >
            {(p) => (
              <Select {...p} {...form.register("role")}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {needsStation && me.role !== "station_oic" ? (
          <Field
            label="Station"
            error={errors.stationId?.message}
            hint={
              role === "station_oic"
                ? "If the station already has an OIC, they become an officer."
                : undefined
            }
          >
            {(p) => (
              <Select {...p} {...form.register("stationId", { setValueAs: (v) => v || null })}>
                <option value="">Choose a station</option>
                {stations.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
      </form>
    </Dialog>
  );
}

// ── Role and station ─────────────────────────────────────────────────────

type RoleIn = z.input<typeof changeRoleSchema>;
type RoleOut = z.output<typeof changeRoleSchema>;

function ChangeRoleDialog({ user, onClose }: { user: StaffUserView; onClose: () => void }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const roles = STAFF_ROLES.filter((r) => canManageRole(me.role, r));
  const stations = useStations();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RoleIn, unknown, RoleOut>({
    resolver: zodResolver(changeRoleSchema),
    defaultValues: { role: user.role, stationId: user.stationId, reason: "" },
  });
  const role = useWatch({ control: form.control, name: "role" }) as StaffRole;

  const save = useMutation({
    mutationFn: (values: RoleOut) =>
      api(`/users/${user.id}/role`, {
        method: "POST",
        body: { ...values, stationId: isStationRole(values.role) ? values.stationId : null },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${user.name}'s role was updated. They have been signed out.`);
      onClose();
    },
    onError: (err) => {
      if (!applyServerErrors(form as never, err)) setError((err as Error).message);
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Change role — ${user.name}`}
      description="The person is signed out and must sign in again with the new role."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={form.handleSubmit((v) => save.mutate(v))}
          >
            Save change
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Role" error={form.formState.errors.role?.message}>
          {(p) => (
            <Select {...p} {...form.register("role")}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {isStationRole(role) ? (
          <Field
            label="Station"
            error={form.formState.errors.stationId?.message}
            hint={
              role === "station_oic"
                ? "The station's current OIC, if any, becomes an officer."
                : undefined
            }
          >
            {(p) => (
              <Select {...p} {...form.register("stationId", { setValueAs: (v) => v || null })}>
                <option value="">Choose a station</option>
                {stations.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field
          label="Reason"
          hint="Recorded in the audit log."
          error={form.formState.errors.reason?.message}
        >
          {(p) => <Textarea {...p} rows={3} {...form.register("reason")} />}
        </Field>
      </div>
    </Dialog>
  );
}

// ── Deactivate / reactivate / reset two-step ─────────────────────────────

const REASON_COPY = {
  deactivate: {
    title: "Deactivate account",
    description: (n: string) =>
      `${n} will be signed out now and won't be able to sign in. Their records stay.`,
    button: "Deactivate",
    path: "deactivate",
    done: "Account deactivated.",
  },
  reactivate: {
    title: "Reactivate account",
    description: (n: string) => `${n} will be able to sign in again.`,
    button: "Reactivate",
    path: "reactivate",
    done: "Account reactivated.",
  },
  resetMfa: {
    title: "Reset two-step sign-in",
    description: (n: string) =>
      `${n} will set up their authenticator app again at next sign-in. Use this for a lost or replaced phone.`,
    button: "Reset",
    path: "reset-mfa",
    done: "Two-step sign-in reset.",
  },
} as const;

function ReasonDialog({
  action,
  onClose,
}: {
  action: { kind: keyof typeof REASON_COPY; user: StaffUserView };
  onClose: () => void;
}) {
  const copy = REASON_COPY[action.kind];
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(reasonSchema),
    defaultValues: { reason: "" },
  });
  const run = useMutation({
    mutationFn: (reason: string) =>
      api(`/users/${action.user.id}/${copy.path}`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(copy.done);
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });

  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={copy.title}
      description={copy.description(action.user.name)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={action.kind === "deactivate" ? "danger" : "primary"}
            loading={run.isPending}
            onClick={form.handleSubmit((v) => run.mutate(v.reason))}
          >
            {copy.button}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field
          label="Reason"
          hint="Recorded in the audit log."
          error={form.formState.errors.reason?.message}
        >
          {(p) => <Textarea {...p} rows={3} autoFocus {...form.register("reason")} />}
        </Field>
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onIssued,
}: {
  user: StaffUserView;
  onClose: () => void;
  onIssued: (password: string) => void;
}) {
  const run = useMutation({
    mutationFn: () =>
      api<{ temporaryPassword: string }>(`/users/${user.id}/reset-password`, { method: "POST" }),
    onSuccess: (res) => onIssued(res.temporaryPassword),
    onError: (err) => toast.error((err as Error).message),
  });
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title="Reset password"
      description={`${user.name} will be signed out and must choose a new password with the temporary one you'll see next.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={run.isPending} onClick={() => run.mutate()}>
            Reset password
          </Button>
        </>
      }
    />
  );
}

function TemporaryPasswordDialog({
  email,
  password,
  created,
  onClose,
}: {
  email: string;
  password: string;
  created: boolean;
  onClose: () => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Copied.");
    } catch {
      toast.error("Couldn't copy — select the password and copy it.");
    }
  };
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={created ? "Account created" : "Temporary password"}
      description="Give this password to the person in person or by phone. It is shown only once."
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Account: <span className="font-medium text-ink">{email}</span>
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-raised p-3">
          <code className="flex-1 font-mono text-base tracking-wide text-ink select-all">
            {password}
          </code>
          <Button size="sm" icon={<Copy className="size-4" />} onClick={copy}>
            Copy
          </Button>
        </div>
        <Alert tone="warning">Don't send passwords by email or WhatsApp.</Alert>
      </div>
    </Dialog>
  );
}
