// One account — details, sign-in security, and the actions the backend says
// this user may take (`can`). Every action is recorded in the audit log.

import {
  ArrowLeft,
  Ban,
  ChevronDown,
  KeyRound,
  LockOpen,
  Pencil,
  RotateCcw,
  ShieldOff,
} from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  Menu,
  MenuItem,
  Page,
  Panel,
  Skeleton,
} from "@/ui/index.js";
import { useAccount, useAccountAction, useUpdateAccount } from "../api.js";
import { AccountForm } from "../components/AccountForm.jsx";
import { AccountStatus } from "../components/AccountStatus.jsx";
import { ReasonDialog } from "../components/ReasonDialog.jsx";
import { TemporaryPasswordDialog } from "../components/TemporaryPasswordDialog.jsx";

/** @typedef {"edit" | "reset-password" | "reset-two-step" | "deactivate" | "reactivate" | "unlock" | null} Open */

export function AccountPage() {
  const { id = "" } = useParams();
  const account = useAccount(id);
  const update = useUpdateAccount(id);
  const action = useAccountAction(id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const [notice, setNotice] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [password, setPassword] = useState(/** @type {string | null} */ (null));

  if (account.isPending) {
    return (
      <Page title="Account">
        <Skeleton className="h-40" />
      </Page>
    );
  }
  if (account.isError) {
    return (
      <Page title="Account">
        <Alert tone="danger">{account.error.message}</Alert>
      </Page>
    );
  }
  const a = account.data;
  const signInId = a.email ?? a.serviceNumber ?? "";

  /** @param {string} name @param {object} [body] @param {string} [done] */
  async function run(name, body, done) {
    setError(null);
    setNotice(null);
    try {
      const result = await action.mutateAsync({ action: name, body });
      if (result?.temporaryPassword) setPassword(result.temporaryPassword);
      if (done) setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setOpen(null);
    }
  }

  const more = [
    a.can.resetPassword && { key: "reset-password", label: "Reset password", icon: <KeyRound /> },
    a.can.resetMfa && {
      key: "reset-two-step",
      label: "Reset two-step sign-in",
      icon: <ShieldOff />,
    },
    a.can.unlock && { key: "unlock", label: "Unlock", icon: <LockOpen /> },
    a.can.reactivate && { key: "reactivate", label: "Reactivate", icon: <RotateCcw /> },
    a.can.deactivate && { key: "deactivate", label: "Deactivate", icon: <Ban />, danger: true },
  ].filter(Boolean);

  return (
    <Page
      title={a.name}
      className="max-w-[960px]"
      back={
        <Link
          to="/accounts"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> All accounts
        </Link>
      }
    >
      <div className="grid gap-6">
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Panel>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <Avatar name={a.name} className="size-12 text-base" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-text">{a.roleLabel}</h2>
                <AccountStatus status={a.status} />
              </div>
              <p className="text-sm text-text-muted">
                {a.station?.name ?? a.division?.name ?? "National — all of Sri Lanka"}
                {a.station && a.division ? ` · ${a.division.name}` : ""}
              </p>
            </div>
            {a.can.edit || more.length ? (
              <div className="flex gap-2">
                {a.can.edit ? (
                  <Button icon={<Pencil className="size-4" />} onClick={() => setOpen("edit")}>
                    Edit
                  </Button>
                ) : null}
                {more.length ? (
                  <Menu
                    trigger={
                      <Button>
                        More <ChevronDown className="size-4" aria-hidden />
                      </Button>
                    }
                  >
                    {more.map((m) =>
                      m ? (
                        <MenuItem
                          key={m.key}
                          icon={m.icon}
                          danger={m.danger}
                          onSelect={() => setOpen(/** @type {Open} */ (m.key))}
                        >
                          {m.label}
                        </MenuItem>
                      ) : null,
                    )}
                  </Menu>
                ) : null}
              </div>
            ) : null}
          </div>
          {!a.can.edit && !more.length ? (
            <p className="border-t border-border px-5 py-3 text-[13px] text-text-muted">
              You can view this account but not change it.
            </p>
          ) : null}
        </Panel>

        <Panel title="Details">
          <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
            <Item label="Email">{a.email ?? "—"}</Item>
            <Item label="Service number">
              {a.serviceNumber ? <span className="font-mono">{a.serviceNumber}</span> : "—"}
            </Item>
            <Item label="Phone">{a.phone ?? "—"}</Item>
            <Item label="Account created">{formatDateTime(a.createdAt)}</Item>
          </dl>
        </Panel>

        <Panel title="Sign-in">
          <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
            <Item label="Last sign-in">
              {a.lastSignInAt ? formatDateTime(a.lastSignInAt) : "Never"}
            </Item>
            <Item label="Password">
              {a.mustChangePassword
                ? "Temporary — to be changed at next sign-in"
                : "Chosen by the user"}
            </Item>
            <Item label="Two-step sign-in">
              {a.mfa.enabled
                ? "On"
                : a.mfa.required
                  ? "Off — will be set up at next sign-in"
                  : "Off (optional)"}
            </Item>
            {a.lockedUntil ? (
              <Item label="Locked until">{formatDateTime(a.lockedUntil)}</Item>
            ) : null}
          </dl>
        </Panel>
      </div>

      <AccountForm
        open={open === "edit"}
        onOpenChange={(o) => setOpen(o ? "edit" : null)}
        account={a}
        onSubmit={async (values) => {
          await update.mutateAsync(values);
          setNotice("Changes saved.");
        }}
      />

      <Dialog
        open={open === "reset-password"}
        onOpenChange={(o) => setOpen(o ? "reset-password" : null)}
        title="Reset password?"
        description={`${a.name} gets a temporary password and is signed out everywhere. A locked account is unlocked.`}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={action.isPending}
              onClick={() => run("reset-password")}
            >
              Reset password
            </Button>
          </>
        }
      />
      <Dialog
        open={open === "unlock"}
        onOpenChange={(o) => setOpen(o ? "unlock" : null)}
        title="Unlock account?"
        description={`${a.name} can try signing in again straight away.`}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={action.isPending}
              onClick={() => run("unlock", undefined, "Account unlocked.")}
            >
              Unlock
            </Button>
          </>
        }
      />
      <Dialog
        open={open === "reactivate"}
        onOpenChange={(o) => setOpen(o ? "reactivate" : null)}
        title="Reactivate account?"
        description={`${a.name} can sign in again with their existing password.`}
        footer={
          <>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={action.isPending}
              onClick={() => run("reactivate", undefined, "Account reactivated.")}
            >
              Reactivate
            </Button>
          </>
        }
      />
      <ReasonDialog
        open={open === "deactivate"}
        onOpenChange={(o) => setOpen(o ? "deactivate" : null)}
        title="Deactivate account?"
        description={`${a.name} is signed out everywhere and can't sign in until the account is reactivated. Their records stay.`}
        confirmLabel="Deactivate"
        danger
        onConfirm={(reason) => run("deactivate", { reason }, "Account deactivated.")}
      />
      <ReasonDialog
        open={open === "reset-two-step"}
        onOpenChange={(o) => setOpen(o ? "reset-two-step" : null)}
        title="Reset two-step sign-in?"
        description={`For a lost or new phone. ${a.name} sets it up again at their next sign-in.`}
        confirmLabel="Reset two-step sign-in"
        onConfirm={(reason) => run("reset-two-step", { reason }, "Two-step sign-in reset.")}
      />
      {password ? (
        <TemporaryPasswordDialog
          open
          created={false}
          onClose={() => setPassword(null)}
          name={a.name}
          signInId={signInId}
          password={password}
        />
      ) : null}
    </Page>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-text-muted">{label}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
