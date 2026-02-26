import React from "react";
import {
  User,
  Lock,
  Bell,
  Sliders,
  Save,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";

import {
  getSettings,
  updateProfile,
  changePassword,
  updatePreferences,
  updateSystem,
} from "../../services/settingsApi";

import { getUser } from "../../utils/auth";

export default function Settings() {
  const me = getUser();

  const [tab, setTab] = React.useState("profile"); // profile | security | preferences | system
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [ok, setOk] = React.useState("");

  // ---- state from backend (fallback to local user) ----
  const [profile, setProfile] = React.useState({
    name: me?.name || "",
    email: me?.email || "",
    role: me?.role || "admin",
    station_name: "",
    station_id: "",
  });

  const [prefs, setPrefs] = React.useState({
    theme: "dark", // dark | light
    language: "en", // en | si | ta (optional)
    email_notifications: true,
    push_notifications: true,
  });

  const [system, setSystem] = React.useState({
    auto_refresh_seconds: 10,
    default_page_size: 10,
    enable_audit_log: true,
  });

  const [pwd, setPwd] = React.useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  async function load() {
    try {
      setLoading(true);
      setError("");
      setOk("");

      const res = await getSettings();

      // supports: { profile, preferences, system } OR { data: {...} }
      const data = res?.data ? res.data : res;

      if (data?.profile) setProfile((p) => ({ ...p, ...data.profile }));
      if (data?.preferences) setPrefs((p) => ({ ...p, ...data.preferences }));
      if (data?.system) setSystem((s) => ({ ...s, ...data.system }));
    } catch (e) {
      // Not fatal; page can still work with local fallback.
      setError(e?.message || "Failed to load settings (using local defaults)");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  function toastOk(msg) {
    setOk(msg);
    setTimeout(() => setOk(""), 2500);
  }

  async function saveProfile() {
    try {
      setSaving(true);
      setError("");
      setOk("");

      if (!profile.name.trim()) throw new Error("Name is required");
      if (!profile.email.trim()) throw new Error("Email is required");

      await updateProfile({
        name: profile.name.trim(),
        email: profile.email.trim(),
        station_id: profile.station_id || null,
      });

      toastOk("Profile updated ✅");
    } catch (e) {
      setError(e?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    try {
      setSaving(true);
      setError("");
      setOk("");

      if (!pwd.current_password) throw new Error("Current password is required");
      if (!pwd.new_password) throw new Error("New password is required");
      if (pwd.new_password.length < 6)
        throw new Error("New password must be at least 6 characters");
      if (pwd.new_password !== pwd.confirm_password)
        throw new Error("Passwords do not match");

      await changePassword({
        current_password: pwd.current_password,
        new_password: pwd.new_password,
      });

      setPwd({ current_password: "", new_password: "", confirm_password: "" });
      toastOk("Password changed ✅");
    } catch (e) {
      setError(e?.message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  async function savePrefs() {
    try {
      setSaving(true);
      setError("");
      setOk("");

      await updatePreferences({ ...prefs });
      toastOk("Preferences saved ✅");
    } catch (e) {
      setError(e?.message || "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  async function saveSystem() {
    try {
      setSaving(true);
      setError("");
      setOk("");

      await updateSystem({
        auto_refresh_seconds: Number(system.auto_refresh_seconds) || 10,
        default_page_size: Number(system.default_page_size) || 10,
        enable_audit_log: !!system.enable_audit_log,
      });

      toastOk("System settings updated ✅");
    } catch (e) {
      setError(e?.message || "Failed to update system settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-slate-100 font-semibold text-lg">Settings</p>
            <p className="text-slate-400 text-sm">
              Profile, security, preferences, and system configuration.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200 disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>
            <User className="h-4 w-4" /> Profile
          </TabBtn>
          <TabBtn active={tab === "security"} onClick={() => setTab("security")}>
            <Lock className="h-4 w-4" /> Security
          </TabBtn>
          <TabBtn
            active={tab === "preferences"}
            onClick={() => setTab("preferences")}
          >
            <Bell className="h-4 w-4" /> Preferences
          </TabBtn>
          <TabBtn active={tab === "system"} onClick={() => setTab("system")}>
            <Sliders className="h-4 w-4" /> System
          </TabBtn>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {ok && (
          <div className="mt-3 rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            {ok}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        {loading ? (
          <div className="text-sm text-slate-400">Loading...</div>
        ) : tab === "profile" ? (
          <Section
            title="Profile"
            subtitle="Update your name, email, and station."
            action={
              <ActionBtn onClick={saveProfile} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </ActionBtn>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Full Name"
                value={profile.name}
                onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
              />
              <Field
                label="Email"
                value={profile.email}
                onChange={(v) => setProfile((p) => ({ ...p, email: v }))}
              />
              <ReadOnly label="Role" value={profile.role} />
              <Field
                label="Station ID (optional)"
                value={profile.station_id || ""}
                onChange={(v) => setProfile((p) => ({ ...p, station_id: v }))}
              />
            </div>
          </Section>
        ) : tab === "security" ? (
          <Section
            title="Security"
            subtitle="Change your password."
            action={
              <ActionBtn onClick={savePassword} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Update Password"}
              </ActionBtn>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <PasswordField
                label="Current Password"
                value={pwd.current_password}
                onChange={(v) => setPwd((p) => ({ ...p, current_password: v }))}
              />
              <PasswordField
                label="New Password"
                value={pwd.new_password}
                onChange={(v) => setPwd((p) => ({ ...p, new_password: v }))}
              />
              <PasswordField
                label="Confirm Password"
                value={pwd.confirm_password}
                onChange={(v) => setPwd((p) => ({ ...p, confirm_password: v }))}
              />
            </div>

            <div className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-200">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Use a strong password (min 6 chars). Don’t reuse old passwords.
              </div>
            </div>
          </Section>
        ) : tab === "preferences" ? (
          <Section
            title="Preferences"
            subtitle="Theme, language and notification preferences."
            action={
              <ActionBtn onClick={savePrefs} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </ActionBtn>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Theme"
                value={prefs.theme}
                onChange={(v) => setPrefs((p) => ({ ...p, theme: v }))}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                ]}
              />
              <SelectField
                label="Language"
                value={prefs.language}
                onChange={(v) => setPrefs((p) => ({ ...p, language: v }))}
                options={[
                  { value: "en", label: "English" },
                  { value: "si", label: "Sinhala" },
                  { value: "ta", label: "Tamil" },
                ]}
              />

              <Toggle
                label="Email notifications"
                checked={prefs.email_notifications}
                onChange={(v) =>
                  setPrefs((p) => ({ ...p, email_notifications: v }))
                }
              />
              <Toggle
                label="Push notifications"
                checked={prefs.push_notifications}
                onChange={(v) =>
                  setPrefs((p) => ({ ...p, push_notifications: v }))
                }
              />
            </div>
          </Section>
        ) : (
          <Section
            title="System"
            subtitle="Global panel behavior (admin only)."
            action={
              <ActionBtn onClick={saveSystem} disabled={saving}>
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </ActionBtn>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Auto refresh seconds"
                type="number"
                value={String(system.auto_refresh_seconds)}
                onChange={(v) =>
                  setSystem((s) => ({ ...s, auto_refresh_seconds: v }))
                }
              />
              <Field
                label="Default page size"
                type="number"
                value={String(system.default_page_size)}
                onChange={(v) =>
                  setSystem((s) => ({ ...s, default_page_size: v }))
                }
              />

              <Toggle
                label="Enable audit log"
                checked={system.enable_audit_log}
                onChange={(v) => setSystem((s) => ({ ...s, enable_audit_log: v }))}
              />
            </div>

            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
              <p className="font-semibold">Danger zone</p>
              <p className="text-red-200/80">
                System settings affect all users. Make changes carefully.
              </p>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

/* ---------- UI Helpers ---------- */

function TabBtn({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
        active
          ? "border-cyan-700 bg-cyan-600/15 text-cyan-200"
          : "border-slate-800 bg-slate-950/50 text-slate-200 hover:bg-slate-950",
      ].join(" ")}
      type="button"
    >
      {children}
    </button>
  );
}

function Section({ title, subtitle, action, children }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-slate-100 font-semibold">{title}</p>
          <p className="text-slate-400 text-sm">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        {children}
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200 disabled:opacity-60"
      type="button"
    >
      {children}
    </button>
  );
}

function Label({ children }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100 outline-none"
      />
    </div>
  );
}

function PasswordField({ label, value, onChange }) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100 outline-none"
      />
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/40 p-2 text-sm text-slate-200">
        {value}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100 outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-sm text-slate-200">{label}</p>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          "h-7 w-12 rounded-full border transition",
          checked
            ? "border-cyan-700 bg-cyan-600/30"
            : "border-slate-700 bg-slate-900/60",
        ].join(" ")}
      >
        <div
          className={[
            "h-6 w-6 rounded-full bg-slate-200 transition",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  );
}