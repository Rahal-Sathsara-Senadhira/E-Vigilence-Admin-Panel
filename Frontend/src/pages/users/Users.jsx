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
// A user's stationId refs PoliceStation (Backend/src/db/providers/mongo/models/User.js),
// not RegionalStation — this used to call listRegionalStations(), so the
// Station filter/picker here was offering the wrong resource entirely.
import { fetchPoliceStations } from "../../services/policeStationsApi";
import { ASSIGNABLE_ROLES, formatRole } from "../../utils/roles";
import { Card, Button, Modal, Badge, Input, Select, Label, ErrorState } from "../../components/ui";

export default function Users() {
  const [users, setUsers] = React.useState([]);
  const [stations, setStations] = React.useState([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // filters
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("");
  const [isActiveFilter, setIsActiveFilter] = React.useState(""); // "" | "true" | "false"
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
  const [formRole, setFormRole] = React.useState("station_officer");
  const [formStation, setFormStation] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function loadStations() {
    const data = await fetchPoliceStations();
    setStations(Array.isArray(data) ? data : []);
  }

  async function loadUsers(next = {}) {
    try {
      setLoading(true);
      setError("");

      const res = await listUsers({
        q,
        role,
        isActive: isActiveFilter,
        stationId,
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
  }, [q, role, isActiveFilter, stationId, page, limit]);

  function openCreate() {
    setMode("create");
    setEditing(null);
    setName("");
    setEmail("");
    setFormRole("station_officer");
    setFormStation("");
    setOpen(true);
  }

  function openEdit(u) {
    setMode("edit");
    setEditing(u);
    setName(u?.name || "");
    setEmail(u?.email || "");
    setFormRole(u?.role || "station_officer");
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
        stationId: formStation || null,
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

  async function toggleActive(u) {
    try {
      const id = u?.id || u?._id;
      await updateUser(id, { isActive: !u.isActive });
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
      <Card
        title="Users"
        subtitle="Manage roles, station access, and account status."
        action={
          <Button onClick={openCreate} icon={Plus}>
            Add User
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Search</Label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 focus-within:border-brand-blue">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Search by name or email..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 outline-none"
              />
            </div>
          </div>

          <Select
            label="Role"
            value={role}
            onChange={(e) => {
              setPage(1);
              setRole(e.target.value);
            }}
          >
            <option value="">All</option>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {formatRole(r)}
              </option>
            ))}
          </Select>

          <Select
            label="Status"
            value={isActiveFilter}
            onChange={(e) => {
              setPage(1);
              setIsActiveFilter(e.target.value);
            }}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>

          <div className="md:col-span-2">
            <Select
              label="Station"
              value={stationId}
              onChange={(e) => {
                setPage(1);
                setStationId(e.target.value);
              }}
            >
              <option value="">All</option>
              {stations.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <Select
            label="Rows"
            value={limit}
            onChange={(e) => {
              setPage(1);
              setLimit(Number(e.target.value));
            }}
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>

          <div className="flex items-end">
            <Button variant="secondary" onClick={() => loadUsers({ page: 1 })} icon={RefreshCcw} className="w-full">
              Refresh
            </Button>
          </div>
        </div>

        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      {/* List */}
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">
            Showing <span className="font-bold text-slate-900 dark:text-slate-200">{users.length}</span> users
            {total ? (
              <>
                {" "}
                of <span className="font-bold text-slate-900 dark:text-slate-200">{total}</span>
              </>
            ) : null}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              icon={ChevronLeft}
            >
              Prev
            </Button>

            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Page <span className="font-bold text-slate-900 dark:text-slate-100">{page}</span> /{" "}
              <span className="font-bold text-slate-900 dark:text-slate-100">{totalPages}</span>
            </div>

            <Button
              variant="ghost"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/40 px-3 py-2 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-3">Station</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>

          {loading ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">Loading...</div>
          ) : users.length === 0 ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">No users found.</div>
          ) : (
            users.map((u) => (
              <div
                key={u.id || u._id}
                className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-slate-800 px-3 py-3"
              >
                <div className="col-span-4">
                  <p className="font-bold text-slate-900 dark:text-slate-100">{u.name}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{u.email}</p>
                </div>

                <div className="col-span-2">
                  <Badge tone="blue">{formatRole(u.role)}</Badge>
                </div>

                <div className="col-span-3">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {stationLabel(u) || <span className="text-slate-500">—</span>}
                  </p>
                </div>

                <div className="col-span-2">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`rounded-xl px-3 py-1 text-xs font-semibold ${
                      u.isActive
                        ? "bg-green-100 dark:bg-green-600/20 text-green-800 dark:text-green-200"
                        : "bg-red-100 dark:bg-red-600/20 text-red-800 dark:text-red-200"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </button>
                </div>

                <div className="col-span-1 flex justify-end gap-2">
                  <Button variant="ghost" iconOnly onClick={() => openEdit(u)} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button variant="danger" iconOnly onClick={() => onDelete(u)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Modal */}
      <Modal
        open={open}
        onClose={closeModal}
        title={mode === "create" ? "Add User" : "Edit User"}
      >
        <form onSubmit={onSubmit} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select label="Role" value={formRole} onChange={(e) => setFormRole(e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {formatRole(r)}
                </option>
              ))}
            </Select>

            <Select label="Station" value={formStation} onChange={(e) => setFormStation(e.target.value)}>
              <option value="">— none —</option>
              {stations.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <Button type="submit" disabled={submitting} icon={Plus}>
            {submitting ? "Saving..." : "Save"}
          </Button>

          <p className="text-xs font-medium text-slate-600 dark:text-slate-500">
            Tip: “Station” can be empty for HQ staff.
          </p>
        </form>
      </Modal>
    </div>
  );
}
