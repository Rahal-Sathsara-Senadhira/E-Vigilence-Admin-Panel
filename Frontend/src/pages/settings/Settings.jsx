import React from "react";
import { Save } from "lucide-react";
import { getSettings, updateSettings } from "../../services/settingsApi";

export default function Settings() {
  const [data, setData] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  async function load() {
    const res = await getSettings();
    setData(res.data);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function onSave(e) {
    e.preventDefault();
    setSaving(true);
    await updateSettings(data);
    setSaving(false);
  }

  if (!data) return <p className="text-slate-300">Loading…</p>;

  return (
    <form
      onSubmit={onSave}
      className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 max-w-2xl"
    >
      <Field
        label="System Name"
        value={data.system_name}
        onChange={(v) => setData({ ...data, system_name: v })}
      />

      <Field
        label="Support Email"
        value={data.support_email || ""}
        onChange={(v) => setData({ ...data, support_email: v })}
      />

      <Field
        label="Default Region"
        value={data.default_region || ""}
        onChange={(v) => setData({ ...data, default_region: v })}
      />

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={data.notifications_enabled}
          onChange={(e) =>
            setData({ ...data, notifications_enabled: e.target.checked })
          }
        />
        Enable Notifications
      </label>

      <div className="flex justify-end">
        <button
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 bg-cyan-600/20 px-4 py-2 text-sm text-cyan-200"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, value, onChange }) {
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
