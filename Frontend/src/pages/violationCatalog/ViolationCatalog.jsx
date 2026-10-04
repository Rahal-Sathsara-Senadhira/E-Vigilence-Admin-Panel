import React from "react";
import { Plus, Search, Pencil, Trash2, RefreshCcw } from "lucide-react";

import {
  listViolationCatalog,
  createViolationCatalogEntry,
  updateViolationCatalogEntry,
  deleteViolationCatalogEntry,
} from "../../services/violationCatalogApi";
import { Card, Button, Modal, Badge, Input, Select, Label, ErrorState } from "../../components/ui";

const SEVERITIES = ["minor", "moderate", "severe"];
const SEVERITY_TONE = { minor: "green", moderate: "amber", severe: "red" };

export default function ViolationCatalog() {
  const [entries, setEntries] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [q, setQ] = React.useState("");

  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState("create"); // create | edit
  const [editing, setEditing] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [name, setName] = React.useState("");
  const [legalCode, setLegalCode] = React.useState("");
  const [fineAmount, setFineAmount] = React.useState("");
  const [severity, setSeverity] = React.useState("moderate");
  const [isActive, setIsActive] = React.useState(true);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await listViolationCatalog({ q });
      setEntries(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e?.message || "Failed to load violation catalog");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function openCreate() {
    setMode("create");
    setEditing(null);
    setName("");
    setLegalCode("");
    setFineAmount("");
    setSeverity("moderate");
    setIsActive(true);
    setOpen(true);
  }

  function openEdit(entry) {
    setMode("edit");
    setEditing(entry);
    setName(entry?.name || "");
    setLegalCode(entry?.legalCode || "");
    setFineAmount(entry?.fineAmount == null ? "" : String(entry.fineAmount));
    setSeverity(entry?.severity || "moderate");
    setIsActive(entry?.isActive ?? true);
    setOpen(true);
  }

  function closeModal() {
    if (submitting) return;
    setOpen(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        name: name.trim(),
        legalCode: legalCode.trim() || null,
        fineAmount: fineAmount === "" ? null : Number(fineAmount),
        severity,
        isActive,
      };

      if (!payload.name) throw new Error("Name is required");

      if (mode === "create") {
        await createViolationCatalogEntry(payload);
      } else {
        await updateViolationCatalogEntry(editing?.id, payload);
      }

      setOpen(false);
      await load();
    } catch (e2) {
      setError(e2?.message || "Failed to save catalog entry");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(entry) {
    const ok = confirm(`Delete violation type "${entry?.name}"? This can't be undone.`);
    if (!ok) return;

    try {
      await deleteViolationCatalogEntry(entry.id);
      await load();
    } catch (e) {
      setError(e?.message || "Failed to delete catalog entry");
    }
  }

  return (
    <div className="grid gap-4">
      <Card
        title="Violation Catalog"
        subtitle="The controlled list of violation types officers pick from when filing a report — including fine amounts and legal codes."
        action={
          <Button onClick={openCreate} icon={Plus}>
            Add Violation Type
          </Button>
        }
      >
        <div className="flex items-center gap-2">
          <div className="max-w-sm flex-1 flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 focus-within:border-brand-blue">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name..."
              className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 outline-none"
            />
          </div>

          <Button variant="secondary" onClick={load} icon={RefreshCcw}>
            Refresh
          </Button>
        </div>

        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      <Card>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/40 px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
            <div className="col-span-4">Name</div>
            <div className="col-span-2">Legal Code</div>
            <div className="col-span-2">Fine Amount</div>
            <div className="col-span-2">Severity</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {loading ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">Loading...</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">
              No violation types yet.
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-3 items-center"
              >
                <div className="col-span-4">
                  <p className="font-bold text-slate-900 dark:text-slate-100">{entry.name}</p>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-slate-700 dark:text-slate-300">{entry.legalCode || "—"}</p>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {entry.fineAmount == null ? "—" : `Rs. ${entry.fineAmount}`}
                  </p>
                </div>

                <div className="col-span-2">
                  <Badge tone={SEVERITY_TONE[entry.severity] || "blue"}>{entry.severity}</Badge>
                </div>

                <div className="col-span-1">
                  <Badge tone={entry.isActive ? "green" : "red"}>
                    {entry.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>

                <div className="col-span-1 flex justify-end gap-2">
                  <Button variant="ghost" iconOnly onClick={() => openEdit(entry)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button variant="danger" iconOnly onClick={() => onDelete(entry)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Modal
        open={open}
        onClose={closeModal}
        title={mode === "create" ? "Add Violation Type" : "Edit Violation Type"}
      >
        <form onSubmit={onSubmit} className="grid gap-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />

          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Legal Code" value={legalCode} onChange={(e) => setLegalCode(e.target.value)} />
            <Input
              label="Fine Amount (Rs.)"
              type="number"
              value={fineAmount}
              onChange={(e) => setFineAmount(e.target.value)}
            />

            <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>

            <Select
              label="Status"
              value={isActive ? "true" : "false"}
              onChange={(e) => setIsActive(e.target.value === "true")}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>

          <Button type="submit" disabled={submitting} icon={Plus}>
            {submitting ? "Saving..." : "Save"}
          </Button>

          <p className="text-xs font-medium text-slate-600 dark:text-slate-500">
            Inactive types stay on past records but no longer appear in the picker on new reports.
          </p>
        </form>
      </Modal>
    </div>
  );
}
