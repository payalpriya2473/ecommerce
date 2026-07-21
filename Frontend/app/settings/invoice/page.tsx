"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  Save, RotateCcw, FileText, ShoppingCart, Receipt, Clock, Settings, Loader2,
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

interface NumberingConfig {
  prefix: string;
  suffix: string;
  startNumber: number;
  currentNumber: number;
  resetFrequency: "never" | "monthly" | "yearly";
  lastReset: string | null;
}

interface InvoiceSettingsState {
  po: NumberingConfig;
  pi: NumberingConfig;
  si: NumberingConfig;        // ← NEW
}

// ── Preview: always "<prefix><NNNN>/<FY><suffix>" ────────────────────────────
const formatPreview = (cfg: NumberingConfig): string => {
  const now    = new Date();
  const year   = now.getFullYear();
  const fyStart = now.getMonth() >= 3 ? year : year - 1;
  const fyEnd   = fyStart + 1;
  const fy      = `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`; // "25-26"
  const num     = String(cfg.currentNumber).padStart(4, "0");
  return `${cfg.prefix || ""}${num}/${fy}${cfg.suffix || ""}`;
};

const FREQ_OPTIONS: { value: NumberingConfig["resetFrequency"]; label: string }[] = [
  { value: "never",   label: "Never" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly",  label: "Yearly (Financial Year)" },
];

// ── Reusable card ─────────────────────────────────────────────────────────────
interface NumberingCardProps {
  title: string;
  icon: React.ReactNode;
  config: NumberingConfig;
  onChange: (updated: NumberingConfig) => void;
  onReset: () => void;
  iconBgClass: string;
}

function NumberingCard({ title, icon, config, onChange, onReset, iconBgClass }: NumberingCardProps) {
  const set = (key: keyof NumberingConfig, val: unknown) =>
    onChange({ ...config, [key]: val });

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBgClass}`}>{icon}</div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>

      <div className="px-6 py-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Prefix</label>
            <input
              type="text"
              value={config.prefix}
              onChange={(e) => set("prefix", e.target.value)}
              placeholder="e.g. SI- (optional)"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Suffix</label>
            <input
              type="text"
              value={config.suffix}
              onChange={(e) => set("suffix", e.target.value)}
              placeholder="(optional)"
              className="w-full border border-input rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Start Number</label>
            <input
              type="number"
              min={1}
              value={config.startNumber}
              onChange={(e) => set("startNumber", Number(e.target.value))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Current Number</label>
            <input
              type="number"
              min={1}
              value={config.currentNumber}
              onChange={(e) => set("currentNumber", Number(e.target.value))}
              className="w-full border border-input rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Reset Frequency</label>
          <select
            value={config.resetFrequency}
            onChange={(e) => set("resetFrequency", e.target.value as NumberingConfig["resetFrequency"])}
            className="w-full border border-input rounded-lg px-3 py-2 text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition"
          >
            {FREQ_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Live preview */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Format Preview</label>
          <div className="bg-muted border border-border rounded-lg px-4 py-2.5 text-sm font-mono text-foreground tracking-wide">
            {formatPreview(config)}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock size={13} />
            <span>
              Last reset:{" "}
              {config.lastReset
                ? new Date(config.lastReset).toLocaleDateString("en-IN", {
                    year: "numeric", month: "short", day: "numeric",
                  })
                : "Never"}
            </span>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted hover:text-foreground transition"
          >
            <RotateCcw size={12} />
            Reset Numbers Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InvoiceSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const DEFAULT_STATE: InvoiceSettingsState = {
    po: { prefix: "PO-", suffix: "", startNumber: 1, currentNumber: 1, resetFrequency: "monthly",  lastReset: null },
    pi: { prefix: "PI-", suffix: "", startNumber: 1, currentNumber: 1, resetFrequency: "monthly",  lastReset: null },
    si: { prefix: "",    suffix: "", startNumber: 1, currentNumber: 1, resetFrequency: "yearly",   lastReset: null },
  };

  const [settings, setSettings] = useState<InvoiceSettingsState>(DEFAULT_STATE);

  useEffect(() => {
    const token = sessionStorage.getItem("authToken");
    if (!token) { setError("Session expired."); setLoading(false); router.push("/login"); return; }

    fetch(`${API_BASE_URL}/settings/invoice`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err?.message || "Failed to load settings");
        }
        return r.json();
      })
      .then((data) => {
        // Back-fill si defaults if older backend doesn't return it yet
        setSettings({
          po: data.po ?? DEFAULT_STATE.po,
          pi: data.pi ?? DEFAULT_STATE.pi,
          si: data.si ?? DEFAULT_STATE.si,
        });
        setLoading(false);
      })
      .catch((err) => {
        if (String(err?.message || "").toLowerCase().includes("invalid or expired token")) {
          sessionStorage.clear(); router.push("/login"); return;
        }
        setError(String(err?.message || "Failed to load settings"));
        setLoading(false);
      });
  }, [router]);

  const updateSection =
    (section: keyof InvoiceSettingsState) => (updated: NumberingConfig) =>
      setSettings((prev) => ({ ...prev, [section]: updated }));

  const handleReset = (section: keyof InvoiceSettingsState) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        currentNumber: prev[section].startNumber,
        lastReset: new Date().toISOString(),
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const token = sessionStorage.getItem("authToken");
      if (!token) { setError("Session expired."); router.push("/login"); setSaving(false); return; }

      const res = await fetch(`${API_BASE_URL}/settings/invoice`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const err = await res.json();
        if (String(err?.message || "").toLowerCase().includes("invalid or expired token")) {
          sessionStorage.clear(); router.push("/login"); return;
        }
        throw new Error(err.message || "Save failed");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4">
          <div className="w-full">
            {/* Breadcrumb */}
            <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
              <span>/</span>
              <span className="font-semibold text-foreground">Invoice Settings</span>
            </div>

            <div className="mb-6">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Invoice Settings</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Configure auto-numbering for Purchase Orders, Purchase Invoices and Sales Invoices.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="animate-spin h-5 w-5" />
                <span className="text-sm">Loading settings…</span>
              </div>
            ) : (
              <div className="space-y-6 pb-24">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                {/* ── Sales Invoice ── */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <FileText size={13} />
                    Sales Invoice Numbering
                  </h3>
                  <NumberingCard
                    title="Sales Invoice (SI) Number Format"
                    icon={<FileText size={16} className="text-red-600" />}
                    config={settings.si}
                    onChange={updateSection("si")}
                    onReset={() => handleReset("si")}
                    iconBgClass="bg-red-50"
                  />
                </div>

                {/* ── Purchase Order ── */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <ShoppingCart size={13} />
                    Purchase Order Numbering
                  </h3>
                  <NumberingCard
                    title="Purchase Order (PO) Number Format"
                    icon={<ShoppingCart size={16} className="text-accent" />}
                    config={settings.po}
                    onChange={updateSection("po")}
                    onReset={() => handleReset("po")}
                    iconBgClass="bg-accent/10"
                  />
                </div>

                {/* ── Purchase Invoice ── */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                    <Receipt size={13} />
                    Purchase Invoice Numbering
                  </h3>
                  <NumberingCard
                    title="Purchase Invoice (PI) Number Format"
                    icon={<Receipt size={16} className="text-accent" />}
                    config={settings.pi}
                    onChange={updateSection("pi")}
                    onReset={() => handleReset("pi")}
                    iconBgClass="bg-accent/10"
                  />
                </div>

                {/* Info box */}
                <div className="bg-accent/5 border border-accent/20 rounded-xl px-5 py-4 text-xs text-foreground space-y-1.5">
                  <p className="font-semibold mb-1">How document numbers are generated</p>
                  <p>Format: <code className="bg-accent/10 px-1 rounded font-mono">[Prefix]NNNN/YY-YY[Suffix]</code></p>
                  <p>Example (no prefix): <code className="bg-accent/10 px-1 rounded font-mono">0017/25-26</code></p>
                  <p>Example (prefix "SI-"): <code className="bg-accent/10 px-1 rounded font-mono">SI-0017/25-26</code></p>
                  <p className="pt-1 text-muted-foreground">
                    <strong>Yearly reset</strong> resets the counter on 1 April (start of Indian financial year).
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 bg-background border-t border-border px-6 py-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
              saved
                ? "bg-green-600 text-white"
                : "bg-gradient-to-r from-accent to-accent-secondary text-white hover:opacity-90 active:scale-95"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Settings"}
          </button>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}
