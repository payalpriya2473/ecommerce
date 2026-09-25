"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, RefreshCw, Send, XCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onlineStoreSettingsAPI, type EmailHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

const EVENT_LABEL: Record<string, string> = {
  placed: "Order placed",
  payment_failed: "Payment failed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refund_initiated: "Refund initiated",
  refunded: "Refund completed",
  payment_issue: "Payment alert",
};

/** Shows whether order emails can go out, why not, and lets the admin send a test. */
export function EmailHealthCard({ canEdit }: { canEdit: boolean }) {
  const [health, setHealth] = useState<EmailHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    const token = sessionStorage.getItem("authToken");
    if (!token) return;
    setLoading(true);
    const res = await onlineStoreSettingsAPI.emailHealth(token).catch(() => null);
    setLoading(false);
    if (res?.success && res.data) {
      setHealth(res.data);
      setError("");
    } else setError(res?.message || "Could not check email settings");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendTest = async () => {
    const token = sessionStorage.getItem("authToken");
    if (!token || !to.trim()) return;
    setSending(true);
    setTestResult(null);
    const res = await onlineStoreSettingsAPI.sendTestEmail(token, to.trim()).catch(() => null);
    setSending(false);
    setTestResult({ ok: Boolean(res?.success), message: res?.message || "Could not send" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            {health ? (
              health.ok ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />
            ) : null}
            Email delivery check
          </CardTitle>
          <CardDescription>Everything that decides whether order emails reach customers.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} /> Re-check
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && !health ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {health?.checks.map((c) => (
              <li key={c.key} className="flex gap-3 p-3 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600 shrink-0" />
                ) : (
                  <XCircle className={cn("h-4 w-4 mt-0.5 shrink-0", c.key === "alertEmail" ? "text-amber-500" : "text-red-600")} />
                )}
                <div className="min-w-0">
                  <div className="font-medium">{c.label}</div>
                  <div className="text-muted-foreground break-words">{c.detail}</div>
                  {c.fix && <div className="text-xs mt-1 text-amber-800">Fix: {c.fix}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Send a test email</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input type="email" placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
              <Button onClick={() => void sendTest()} disabled={sending || !to.trim()} className="h-9">
                {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Send test
              </Button>
            </div>
            {testResult && (
              <p className={cn("text-sm mt-2", testResult.ok ? "text-green-700" : "text-red-600")}>{testResult.message}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              SMTP details are set in{" "}
              <Link href="/settings/email" className="underline">
                Settings → Email Config
              </Link>
              .
            </p>
          </div>
        )}

        {health?.recent?.length ? (
          <div>
            <div className="text-sm font-medium mb-2">Latest order emails</div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">When</th>
                    <th className="p-2 font-medium">Order</th>
                    <th className="p-2 font-medium">Email</th>
                    <th className="p-2 font-medium">To</th>
                    <th className="p-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {health.recent.map((r) => (
                    <tr key={r.id} className="border-t align-top">
                      <td className="p-2 whitespace-nowrap text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        <Link href={`/online-orders/view?id=${r.orderId}`} className="text-primary hover:underline">
                          {r.orderNumber || `#${r.orderId}`}
                        </Link>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {EVENT_LABEL[r.event] || r.event}
                        <span className="text-muted-foreground"> · {r.audience}</span>
                      </td>
                      <td className="p-2 max-w-[200px] truncate" title={r.recipient || ""}>
                        {r.recipient || "-"}
                      </td>
                      <td className="p-2">
                        <span
                          className={cn(
                            "rounded border px-1.5 py-0.5 text-xs font-medium capitalize",
                            r.status === "sent"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : r.status === "failed"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                          )}
                        >
                          {r.status}
                        </span>
                        {r.error && <div className="text-xs text-muted-foreground mt-1 max-w-[320px] break-words">{r.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
