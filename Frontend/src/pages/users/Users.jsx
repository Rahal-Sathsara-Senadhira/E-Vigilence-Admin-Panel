import React from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCcw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { listUsers, createUser, updateUser, deleteUser } from "../../services/usersApi";
import { listRegionalStations } from "../../services/regionalStationsApi";

const ROLES = ["admin", "officer", "viewer"];
const STATUSES = ["active", "disabled"];

export default function Users() {
  const [users, setUsers] = React.useState([]);
  const [stations, setStations] = React.useState([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // filters
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [stationId, setStationId] = React.useState("");

  // pagination
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(10);
  const [total, setTotal] = React.useState(0);

  // modal
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState("create"); // create | edit
  const [editing, setEditing] = React.useState(null);

  // form fields
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [formRole, setFormRole] = React.useState("viewer");
  const [formStation, setFormStation] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function loadStations() {
    const res = await listRegionalStations();
    const data = Array.isArray(res) ? res : res?.data;
    setStations(Array.isArray(data) ? data : []);
  }

  async function loadUsers(next = {}) {
    try {
      setLoading(true);
      setError("");

      const res = await listUsers({
        q,
        role,
        status,
        station_id: stationId,
        page,
        limit,
        ...next,
      });

      // Backend can return:
      // A) { data: [...], meta: { total, page, limit } }
      // B) { users: [...], total, page, limit }
      // C) just an array (older style)
      const arr =
        Array.isArray(res) ? res :
        Array.isArray(res?.data) ? res.data :
        Array.isArray(res?.users) ? res.users :
        [];

      const nextTotal =
        res?.meta?.total ??
        res?.total ??
        (Array.isArray(res) ? res.length : arr.length);

      const nextPage = res?.meta?.page ?? res?.page ?? page;
      const nextLimit = res?.meta?.limit ?? res?.limit ?? limit;

      setUsers(arr);
      setTotal(Number(nextTotal) || 0);
      setPage(Number(nextPage) || page);
      setLimit(Number(nextLimit) || limit);
    } catch (e) {
      setError(e?.message || "Failed to load users");
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    (async () => {
      await loadStations();
      await loadUsers({ page: 1 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    // refetch when filters/page/limit changes
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role, status, stationId, page, limit]);

  function openCreate() {
    setMode("create");
    setEditing(null);
    setName("");
    setEmail("");
    setFormRole("viewer");
    setFormStation("");
    setOpen(true);
  }

  function openEdit(u) {
    setMode("edit");
    setEditing(u);
    setName(u?.name || "");
    setEmail(u?.email || "");
    setFormRole(u?.role || "viewer");
    setFormStation(u?.station_id || u?.stationId || "");
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
        email: email.trim(),
        role: formRole,
        station_id: formStation || null,
      };

      if (!payload.name) throw new Error("Name is required");
      if (!payload.email) throw new Error("Email is required");

      if (mode === "create") {
        await createUser(payload);
      } else {
        await updateUser(editing?.id || editing?._id, payload);
      }

      setOpen(false);
      await loadUsers();
    } catch (e2) {
      setError(e2?.message || "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(u) {
    try {
      const id = u?.id || u?._id;
      const next = u.status === "active" ? "disabled" : "active";
      await updateUser(id, { status: next });
      await loadUsers();
    } catch (e) {
      setError(e?.message || "Failed to update status");
    }
  }

  async function onDelete(u) {
    const id = u?.id || u?._id;
    const ok = confirm(`Delete user "${u?.name}"? This can't be undone.`);
    if (!ok) return;

    try {
      await deleteUser(id);
      // if last item deleted in page, go back a page safely
      const remaining = users.length - 1;
      if (remaining <= 0 && page > 1) setPage((p) => p - 1);
      else await loadUsers();
    } catch (e) {
      setError(e?.message || "Failed to delete user");
    }
  }

  function stationLabel(u) {
    const sid = u?.station_id || u?.stationId;
    const fromUser = u?.station_name || u?.stationName;
    if (fromUser) return fromUser;
    if (!sid) return "";
    const s = stations.find((x) => String(x.id) === String(sid) || String(x._id) === String(sid));
    return s?.name || "";
  }

  return (
    <div className="grid gap-4">
      {/* Header / Filters */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-slate-100 font-semibold text-lg">Users</p>
            <p className="text-slate-400 text-sm">
              Manage roles, station access, and account status.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 px-3 py-2 text-cyan-200"
          >
            <Plus className="h-4 w-4" /> Add User
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Search</Label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Search by name or email..."
                className="w-full bg-transparent text-sm text-slate-100 outline-none"
              />
            </div>
          </div>

          <div>
            <Label>Role</Label>
            <select
              value={role}
              onChange={(e) => {
                setPage(1);
                setRole(e.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label>Station</Label>
            <select
              value={stationId}
              onChange={(e) => {
                setPage(1);
                setStationId(e.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {stations.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Rows</Label>
            <select
              value={limit}
              onChange={(e) => {
                setPage(1);
                setLimit(Number(e.target.value));
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => loadUsers({ page: 1 })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-200"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Showing <span className="text-slate-200">{users.length}</span> users
            {total ? (
              <>
                {" "}
                of <span className="text-slate-200">{total}</span>
              </>
            ) : null}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>

            <div className="text-sm text-slate-300">
              Page <span className="text-slate-100 font-medium">{page}</span> /{" "}
              <span className="text-slate-100 font-medium">{totalPages}</span>
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-800 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-3">Station</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {loading ? (
            <div className="px-3 py-6 text-sm text-slate-400">Loading...</div>
          ) : users.length === 0 ? (
            <div className="px-3 py-6 text-sm text-slate-400">No users found.</div>
          ) : (
            users.map((u) => (
              <div
                key={u.id || u._id}
                className="grid grid-cols-12 gap-2 border-b border-slate-800 px-3 py-3"
              >
                <div className="col-span-4">
                  <p className="text-slate-100 font-medium">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>

                <div className="col-span-2">
                  <Pill text={u.role} />
                </div>

                <div className="col-span-3">
                  <p className="text-sm text-slate-200">
                    {stationLabel(u) || <span className="text-slate-500">—</span>}
                  </p>
                </div>

                <div className="col-span-2">
                  <button
                    onClick={() => toggleStatus(u)}
                    className={`rounded-xl px-3 py-1 text-xs ${
                      u.status === "active"
                        ? "bg-green-600/20 text-green-200"
                        : "bg-red-600/20 text-red-200"
                    }`}
                  >
                    {u.status || "active"}
                  </button>
                </div>

                <div className="col-span-1 flex justify-end gap-2">
                  <button
                    onClick={() => openEdit(u)}
                    className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-slate-200 hover:bg-slate-950"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => onDelete(u)}
                    className="rounded-lg border border-red-900/60 bg-red-950/30 p-2 text-red-200 hover:bg-red-950/50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal */}
      {open && (
        <Modal onClose={closeModal}>
          <form onSubmit={onSubmit} className="grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-slate-100 font-semibold">
                {mode === "create" ? "Add User" : "Edit User"}
              </p>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1 text-sm text-slate-200"
              >
                Close
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Name" value={name} onChange={setName} />
              <Field label="Email" value={email} onChange={setEmail} />
              <SelectField label="Role" value={formRole} onChange={setFormRole}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectField>

              <SelectField label="Station" value={formStation} onChange={setFormStation}>
                <option value="">— none —</option>
                {stations.map((s) => (
                  <option key={s.id || s._id} value={s.id || s._id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </div>

            <button
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 p-2 text-cyan-200 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {submitting ? "Saving..." : "Save"}
            </button>

            <p className="text-xs text-slate-500">
              Tip: “Station” can be empty for admins.
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ---------- UI helpers ---------- */

function Label({ children }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
      >
        {children}
      </select>
    </div>
  );
}

function Pill({ text }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-200">
      {text}
    </span>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}