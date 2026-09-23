"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  Mail,
  Server,
  Lock,
  User,
  Send,
  Save,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: "none" | "ssl" | "tls";
  smtpUser: string;
  smtpPassword: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
}

const DEFAULT_CONFIG: EmailConfig = {
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: "tls",
  smtpUser: "",
  smtpPassword: "",
  fromName: "AppleNext Enterprise Suite",
  fromEmail: "",
  isActive: false,
};

const SMTP_PRESETS = [
  { label: "Gmail", host: "smtp.gmail.com", port: 587, secure: "tls" },
  { label: "Gmail (SSL)", host: "smtp.gmail.com", port: 465, secure: "ssl" },
  { label: "Outlook/Hotmail", host: "smtp.office365.com", port: 587, secure: "tls" },
  { label: "Yahoo", host: "smtp.mail.yahoo.com", port: 587, secure: "tls" },
  { label: "Custom", host: "", port: 587, secure: "tls" },
];

function SettingCard({
  title,
  icon,
  iconClass,
  children,
}: {
  title: string;
  icon: ReactNode;
  iconClass: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className={`rounded-xl p-2.5 ${iconClass}`}>{icon}</div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

export default function EmailConfigPage() {
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const getToken = () => sessionStorage.getItem("authToken") || "";

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/settings/email`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setConfig(data);
    } catch (err: any) {
      showToast("error", err?.message || "Failed to load email configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.smtpHost) return showToast("error", "SMTP Host is required");
    if (!config.smtpUser) return showToast("error", "SMTP Username is required");

    try {
      setSaving(true);
      const res = await fetch(`${API_BASE_URL}/settings/email`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Save failed");
      if (data.smtpSecure) {
        setConfig((previous) => ({ ...previous, smtpSecure: data.smtpSecure }));
      }
      showToast("success", data.message);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) return showToast("error", "Please enter a test email address");

    try {
      setTesting(true);
      const res = await fetch(`${API_BASE_URL}/settings/email/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ toEmail: testEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Test failed");
      showToast("success", data.message);
    } catch (err: any) {
      showToast("error", err.message);
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (preset: typeof SMTP_PRESETS[0]) => {
    if (preset.host) {
      setConfig((prev) => ({
        ...prev,
        smtpHost: preset.host,
        smtpPort: preset.port,
        smtpSecure: preset.secure as EmailConfig["smtpSecure"],
      }));
    }
  };

  const set = (key: keyof EmailConfig, val: any) => setConfig((prev) => ({ ...prev, [key]: val }));

  const statusText = config.isActive ? "Enabled" : "Disabled";
  const statusTone = config.isActive ? "text-emerald-600 bg-emerald-50 border-emerald-200" : "text-slate-600 bg-slate-50 border-slate-200";

  const securityHint = useMemo(() => {
    if (config.smtpSecure === "ssl") return "Port 465 with SSL";
    if (config.smtpSecure === "tls") return "Port 587 with TLS";
    return "Use only with a trusted SMTP server on a custom port";
  }, [config.smtpSecure]);

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="min-h-[calc(100vh-4rem)] w-full bg-[radial-gradient(circle_at_top_left,_rgba(220,38,38,0.06),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.06),_transparent_28%),linear-gradient(to_bottom,_rgba(255,255,255,0.7),_rgba(248,250,252,0.95))]">
          {toast && (
            <div
              className={`fixed right-5 top-5 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-xl transition-all ${
                toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
              }`}
            >
              {toast.type === "success" ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {toast.msg}
            </div>
          )}

          <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-accent/10 p-3 text-accent ring-1 ring-accent/15">
                  <Mail className="h-7 w-7" />
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full border border-accent/20 bg-accent/5 px-3 py-1 text-xs font-semibold tracking-wide text-accent">
                      SYSTEM SETTINGS
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusTone}`}>
                      {statusText}
                    </span>
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                    Email / SMTP Configuration
                  </h1>
                  {/* <p className="mt-1 max-w-3xl text-sm text-muted-foreground sm:text-base">
                    Configure outgoing email server settings for invoices, alerts, and test emails from the AppleNext suite.
                  </p> */}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>

            {loading ? (
              <div className="flex min-h-[60vh] items-center justify-center rounded-3xl border border-border bg-white/70 shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="space-y-6">
                  <SettingCard
                    title="Enable Email Sending"
                    icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
                    iconClass="bg-emerald-100"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium text-foreground">System email delivery</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Turn this on to allow invoices, alerts, and other automated emails to be sent.
                        </p>
                      </div>
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={config.isActive}
                          onChange={(e) => set("isActive", e.target.checked)}
                        />
                        <div className="peer h-7 w-12 rounded-full bg-muted transition after:absolute after:top-0.5 after:left-[2px] after:h-6 after:w-6 after:rounded-full after:border after:border-border after:bg-white after:transition-all after:content-[''] peer-checked:bg-accent peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                  </SettingCard>

                  <SettingCard
                    title="Quick Presets"
                    icon={<Server className="h-5 w-5 text-purple-600" />}
                    iconClass="bg-purple-100"
                  >
                    <div className="flex flex-wrap gap-2">
                      {SMTP_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          onClick={() => applyPreset(p)}
                          className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:bg-accent/5 hover:text-accent"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    {/* <p className="mt-3 text-xs text-muted-foreground">
                      Click a preset to auto-fill host, port, and security. Then enter the SMTP credentials below.
                    </p> */}
                  </SettingCard>

                  <SettingCard
                    title="SMTP Server Settings"
                    icon={<Server className="h-5 w-5 text-green-600" />}
                    iconClass="bg-green-100"
                  >
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-foreground">
                            SMTP Host <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={config.smtpHost}
                            onChange={(e) => set("smtpHost", e.target.value)}
                            placeholder="smtp.gmail.com"
                            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-foreground">SMTP Port</label>
                          <input
                            type="number"
                            value={config.smtpPort}
                            onChange={(e) => set("smtpPort", parseInt(e.target.value) || 587)}
                            placeholder="587"
                            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">Security Protocol</label>
                        <div className="flex flex-wrap gap-4">
                          {(["none", "tls", "ssl"] as const).map((opt) => (
                            <label key={opt} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="smtpSecure"
                                value={opt}
                                checked={config.smtpSecure === opt}
                                onChange={() => set("smtpSecure", opt)}
                                className="accent-accent"
                              />
                              <span className="text-sm font-medium uppercase">{opt === "none" ? "None" : opt.toUpperCase()}</span>
                            </label>
                          ))}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {securityHint}. Port 587 is automatically saved with TLS; port 465 uses SSL.
                        </p>
                      </div>
                    </div>
                  </SettingCard>

                  <SettingCard
                    title="Authentication"
                    icon={<Lock className="h-5 w-5 text-orange-600" />}
                    iconClass="bg-orange-100"
                  >
                    <div className="space-y-5">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">
                          Username / Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={config.smtpUser}
                          onChange={(e) => set("smtpUser", e.target.value)}
                          placeholder="your-email@gmail.com"
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                        {/* <p className="mt-1 text-xs text-muted-foreground">
                          For Gmail, Outlook, and Yahoo, this should usually match the mailbox used for SMTP login.
                        </p> */}
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">
                          Password / App Password
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={config.smtpPassword}
                            onChange={(e) => set("smtpPassword", e.target.value)}
                            placeholder="Enter password or app-specific password"
                            className="w-full rounded-xl border border-input bg-background px-4 py-3 pr-11 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-3 text-muted-foreground transition hover:text-foreground"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {/* <p className="mt-1 text-xs text-muted-foreground">
                          Gmail users: use an app password, not the regular Google account password.
                        </p> */}
                      </div>
                    </div>
                  </SettingCard>

                  <SettingCard
                    title="Sender Information"
                    icon={<User className="h-5 w-5 text-blue-600" />}
                    iconClass="bg-blue-100"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">From Name</label>
                        <input
                          type="text"
                          value={config.fromName}
                          onChange={(e) => set("fromName", e.target.value)}
                          placeholder="AppleNext Enterprise Suite"
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                        {/* <p className="mt-1 text-xs text-muted-foreground">This is the display name in recipients' inboxes.</p> */}
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">From Email</label>
                        <input
                          type="email"
                          value={config.fromEmail}
                          onChange={(e) => set("fromEmail", e.target.value)}
                          placeholder="noreply@applenext.in"
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                        {/* <p className="mt-1 text-xs text-muted-foreground">Leave blank to use the SMTP username as sender.</p> */}
                      </div>
                    </div>
                  </SettingCard>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? "Saving..." : "Save Settings"}
                    </button>
                  </div>
                </div>

                <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
                  <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                    <div className="border-b border-border px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <h2 className="text-base font-semibold text-foreground">Configuration Summary</h2>
                      </div>
                    </div>
                    <div className="space-y-4 px-6 py-5 text-sm">
                      <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3">
                        <span className="text-muted-foreground">Status</span>
                        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone}`}>{statusText}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3">
                        <span className="text-muted-foreground">Host</span>
                        <span className="max-w-[180px] truncate font-medium text-foreground">{config.smtpHost || "Not set"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3">
                        <span className="text-muted-foreground">Port</span>
                        <span className="font-medium text-foreground">{config.smtpPort || 587}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-b border-dashed border-border pb-3">
                        <span className="text-muted-foreground">Security</span>
                        <span className="font-medium uppercase text-foreground">{config.smtpSecure}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">From</span>
                        <span className="max-w-[180px] truncate font-medium text-foreground">{config.fromEmail || config.smtpUser || "Not set"}</span>
                      </div>
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                    <div className="flex items-center gap-3 border-b border-border px-6 py-4">
                      <div className="rounded-xl bg-teal-100 p-2.5 text-teal-700">
                        <Send className="h-5 w-5" />
                      </div>
                      <h2 className="text-base font-semibold text-foreground">Test Email</h2>
                    </div>
                    <div className="px-6 py-5">
                      <p className="mb-4 text-sm text-muted-foreground">
                        A successful test means your SMTP provider accepted the message. Also check the recipient&apos;s Spam folder.
                      </p>
                      <div className="space-y-3">
                        <input
                          type="email"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                        //   placeholder="test@example.com"
                          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                        <button
                          onClick={handleTest}
                          disabled={testing}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {testing ? "Sending..." : "Send Test Email"}
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
                    <div className="border-b border-border px-6 py-4">
                      <h2 className="text-base font-semibold text-foreground">Notes</h2>
                    </div>
                    <div className="space-y-3 px-6 py-5 text-sm text-muted-foreground">
                      <p>Use the SMTP account that matches your provider rules.</p>
                      <p>Gmail usually requires 2FA and an app password.</p>
                      <p>SSL works on 465, TLS works on 587.</p>
                    </div>
                  </section> */}
                </div>
              </div>
            )}
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
