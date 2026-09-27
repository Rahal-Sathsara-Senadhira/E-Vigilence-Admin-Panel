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
  uploadAvatar,
} from "../../services/settingsApi";

import { getUser, getAuth, setAuth } from "../../utils/auth";
import { formatRole } from "../../utils/roles";
import { Card, Button, Input, Select, ReadOnlyField } from "../../components/ui";

export default function Settings() {
  const me = getUser();

  const [tab, setTab] = React.useState("profile"); // profile | security | preferences | system
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [ok, setOk] = React.useState("");

  // ---- state from backend (fallback to local user) ----
  const [profile, setProfile] = React.useState({
    name: me?.name || "",
    email: me?.email || "",
    role: me?.role || "",
    station_name: "",
    station_id: "",
    avatarUrl: me?.avatarUrl || "",
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

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setAvatarUploading(true);
      setError("");

      const res = await uploadAvatar(file);
      const newAvatarUrl = res.data?.avatarUrl;

      if (newAvatarUrl) {
        setProfile((p) => ({ ...p, avatarUrl: newAvatarUrl }));

        // Update local storage so Header/Sidebar updates immediately
        const authData = getAuth();
        if (authData && authData.user) {
          authData.user.avatarUrl = newAvatarUrl;
          setAuth(authData);
          // Optional: fire a custom event if Topbar/Sidebar rely on it instead of state
          window.dispatchEvent(new Event("auth-updated"));
        }

        toastOk("Profile picture updated ✅");
      }
    } catch (e) {
      setError(e?.message || "Failed to upload avatar");
    } finally {
      setAvatarUploading(false);
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
      <Card
        title="Settings"
        subtitle="Profile, security, preferences, and system configuration."
        action={
          <Button variant="secondary" onClick={load} disabled={loading} icon={RefreshCcw}>
            Refresh
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
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
          <div className="mt-3 rounded-xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}
        {ok && (
          <div className="mt-3 rounded-xl border border-emerald-300 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-200">
            {ok}
          </div>
        )}
      </Card>

      <Card>
        {loading ? (
          <div className="text-sm font-medium text-slate-700 dark:text-slate-400">Loading...</div>
        ) : tab === "profile" ? (
          <Section
            title="Profile"
            subtitle="Update your name, email, and station."
            action={
              <Button variant="secondary" onClick={saveProfile} disabled={saving} icon={Save}>
                {saving ? "Saving..." : "Save"}
              </Button>
            }
          >
            <div className="mb-6 flex items-center gap-4">
              <img
                src={profile?.avatarUrl || "/avatars/dr-nanditha.png"}
                alt="Avatar"
                className="h-16 w-16 rounded-full object-cover object-top border border-slate-300 dark:border-slate-700 shrink-0"
                onError={(e) => {
                  e.currentTarget.src = "/avatars/dr-nanditha.png";
                }}
              />

              <div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  {avatarUploading ? "Uploading..." : "Upload new picture"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={avatarUploading}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  JPEG, PNG, or GIF up to 5MB.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Full Name"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              />
              <Input
                label="Email"
                value={profile.email}
                onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
              />
              <ReadOnlyField label="Role" value={formatRole(profile.role)} />
              <Input
                label="Station (optional — HQ staff can leave this blank)"
                value={profile.station_id || ""}
                onChange={(e) => setProfile((p) => ({ ...p, station_id: e.target.value }))}
              />
            </div>
          </Section>
        ) : tab === "security" ? (
          <Section
            title="Security"
            subtitle="Change your password."
            action={
              <Button variant="secondary" onClick={savePassword} disabled={saving} icon={Save}>
                {saving ? "Saving..." : "Update Password"}
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                type="password"
                label="Current Password"
                value={pwd.current_password}
                onChange={(e) => setPwd((p) => ({ ...p, current_password: e.target.value }))}
              />
              <Input
                type="password"
                label="New Password"
                value={pwd.new_password}
                onChange={(e) => setPwd((p) => ({ ...p, new_password: e.target.value }))}
              />
              <Input
                type="password"
                label="Confirm Password"
                value={pwd.confirm_password}
                onChange={(e) => setPwd((p) => ({ ...p, confirm_password: e.target.value }))}
              />
            </div>

            <div className="mt-3 rounded-xl border border-amber-300 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200">
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
              <Button variant="secondary" onClick={savePrefs} disabled={saving} icon={Save}>
                {saving ? "Saving..." : "Save"}
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                label="Theme"
                value={prefs.theme}
                onChange={(e) => setPrefs((p) => ({ ...p, theme: e.target.value }))}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </Select>
              <Select
                label="Language"
                value={prefs.language}
                onChange={(e) => setPrefs((p) => ({ ...p, language: e.target.value }))}
              >
                <option value="en">English</option>
                <option value="si">Sinhala</option>
                <option value="ta">Tamil</option>
              </Select>

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
              <Button variant="secondary" onClick={saveSystem} disabled={saving} icon={Save}>
                {saving ? "Saving..." : "Save"}
              </Button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                label="Auto refresh seconds"
                type="number"
                value={String(system.auto_refresh_seconds)}
                onChange={(e) =>
                  setSystem((s) => ({ ...s, auto_refresh_seconds: e.target.value }))
                }
              />
              <Input
                label="Default page size"
                type="number"
                value={String(system.default_page_size)}
                onChange={(e) =>
                  setSystem((s) => ({ ...s, default_page_size: e.target.value }))
                }
              />

              <Toggle
                label="Enable audit log"
                checked={system.enable_audit_log}
                onChange={(v) => setSystem((s) => ({ ...s, enable_audit_log: v }))}
              />
            </div>

            <div className="mt-4 rounded-xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-200">
              <p className="font-semibold">Danger zone</p>
              <p className="text-red-700/80 dark:text-red-200/80">
                System settings affect all users. Make changes carefully.
              </p>
            </div>
          </Section>
        )}
      </Card>
    </div>
  );
}

/* ---------- UI Helpers specific to this page ---------- */

function TabBtn({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
        active
          ? "border-brand-blue bg-blue-50 dark:bg-blue-950/40 text-brand-blue dark:text-blue-300"
          : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-950",
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
          <p className="text-slate-900 dark:text-slate-100 font-semibold">{title}</p>
          <p className="text-slate-700 dark:text-slate-400 text-sm">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-4">
        {children}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 p-3">
      <p className="text-sm font-medium text-slate-900 dark:text-slate-200">{label}</p>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          "h-7 w-12 rounded-full border transition",
          checked
            ? "border-brand-blue bg-brand-blue/30"
            : "border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-900/60",
        ].join(" ")}
      >
        <div
          className={[
            "h-6 w-6 rounded-full bg-white dark:bg-slate-200 shadow transition",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
