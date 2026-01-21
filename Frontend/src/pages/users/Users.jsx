import React from "react";
import { Plus } from "lucide-react";
import { listUsers, createUser, updateUser } from "../../services/usersApi";
import { listRegionalStations } from "../../services/regionalStationsApi";

export default function Users() {
  const [users, setUsers] = React.useState([]);
  const [stations, setStations] = React.useState([]);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("viewer");
  const [station, setStation] = React.useState("");

  async function load() {
    const [u, s] = await Promise.all([
      listUsers(),
      listRegionalStations(),
    ]);
    setUsers(u.data);
    setStations(s.data);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    await createUser({
      name,
      email,
      role,
      station_id: station || null,
    });
    setName("");
    setEmail("");
    setRole("viewer");
    setStation("");
    load();
  }

  async function toggleStatus(u) {
    await updateUser(u.id, {
      status: u.status === "active" ? "disabled" : "active",
    });
    load();
  }

  return (
    <div className="grid gap-4">
      {/* CREATE USER */}
      <form
        onSubmit={onSubmit}
        className="grid gap-3 md:grid-cols-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
      >
        <Input label="Name" value={name} onChange={setName} />
        <Input label="Email" value={email} onChange={setEmail} />
        <Select label="Role" value={role} onChange={setRole}>
          <option value="admin">admin</option>
          <option value="officer">officer</option>
          <option value="viewer">viewer</option>
        </Select>
        <Select label="Station" value={station} onChange={setStation}>
          <option value="">— none —</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>

        <button className="md:col-span-4 inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 p-2 text-cyan-200">
          <Plus className="h-4 w-4" /> Add User
        </button>
      </form>

      {/* USERS LIST */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between border-b border-slate-800 py-3"
          >
            <div>
              <p className="text-slate-100 font-medium">{u.name}</p>
              <p className="text-xs text-slate-400">
                {u.email} · {u.role}
              </p>
              {u.station_name && (
                <p className="text-xs text-slate-500">
                  Station: {u.station_name}
                </p>
              )}
            </div>

            <button
              onClick={() => toggleStatus(u)}
              className={`rounded-xl px-3 py-1 text-xs ${
                u.status === "active"
                  ? "bg-green-600/20 text-green-200"
                  : "bg-red-600/20 text-red-200"
              }`}
            >
              {u.status}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <p className="text-sm text-slate-400">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
      />
    </div>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <div>
      <p className="text-sm text-slate-400">{label}</p>
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
