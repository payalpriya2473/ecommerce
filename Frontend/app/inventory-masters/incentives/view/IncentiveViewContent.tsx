"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AuthGuard } from "@/components/auth-guard";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
  TrendingUp,
  AlertCircle,
  ArrowLeft,
  Edit,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  User,
} from "lucide-react";
import { incentiveLogAPI } from "@/lib/api";
import type { IncentiveLog } from "@/lib/api";
import { PermissionGate } from "@/components/PermissionGate";

// ─────────────────────────────────────────────────────────────
// EditedByBadge — avatar + full email, same style as list page
// ─────────────────────────────────────────────────────────────

function EditedByBadge({ email }: { email?: string | null }) {
  if (!email) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">—</span>
      </div>
    );
  }

  const username = email.split("@")[0];
  const initial  = username.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2" title={email}>
      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
        <span className="text-[11px] font-bold text-white">{initial}</span>
      </div>
      <span className="text-sm font-medium">{email}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ValueRow
// ─────────────────────────────────────────────────────────────

function ValueRow({
  label,
  oldVal,
  newVal,
  prefix = "",
  suffix = "",
}: {
  label: string;
  oldVal: number;
  newVal: number;
  prefix?: string;
  suffix?: string;
}) {
  const diff    = newVal - oldVal;
  const isUp    = diff > 0;
  const changed = Math.abs(diff) >= 0.001;

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <span className="text-sm font-medium text-muted-foreground w-32">{label}</span>
      <div className="flex items-center gap-3 flex-1 justify-end flex-wrap">
        <span className="text-sm text-muted-foreground">
          {prefix}{Number(oldVal).toFixed(2)}{suffix}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-semibold">
          {prefix}{Number(newVal).toFixed(2)}{suffix}
        </span>
        {changed ? (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full ${
              isUp ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {isUp
              ? <ArrowUpRight className="h-3 w-3" />
              : <ArrowDownRight className="h-3 w-3" />}
            {prefix}{Math.abs(diff).toFixed(2)}{suffix}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
            No change
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────

export default function IncentiveViewContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const logId        = searchParams.get("id");

  const [log, setLog]             = useState<IncentiveLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!logId) { setLoadError("No log ID provided"); setIsLoading(false); return; }
    const load = async () => {
      const token = sessionStorage.getItem("authToken");
      if (!token) return;
      try {
        const res = await incentiveLogAPI.getById(token, logId);
        if (res.success) setLog(res.data);
        else setLoadError(res.message || "Log not found");
      } catch {
        setLoadError("Failed to load incentive log");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [logId]);

  // ── Loading ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  // ── Error ──────────────────────────────────────────────────
  if (loadError || !log) {
    return (
      <AuthGuard>
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-[50vh]">
            <Alert variant="destructive" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{loadError || "Log not found"}</AlertDescription>
            </Alert>
          </div>
        </AuthenticatedLayout>
      </AuthGuard>
    );
  }

  // ── Main view ──────────────────────────────────────────────
  return (
    <AuthGuard>
      <AuthenticatedLayout>
        <div className="py-8 px-4 md:px-6 lg:px-8">

          {/* Back */}
          <Button
            variant="ghost"
            onClick={() => router.push("/inventory-masters/incentives")}
            className="mb-6 bg-red-700 text-white hover:bg-red-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {/* ── Hero card ── */}
          <Card className="mb-6">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-accent to-accent-secondary flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold">{log.itemName}</h1>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {log.brandName && (
                        <Badge variant="secondary">{log.brandName}</Badge>
                      )}
                      {log.itemGroupName && (
                        <Badge variant="outline">{log.itemGroupName}</Badge>
                      )}
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        Active
                      </Badge>
                    </div>
                  </div>
                </div>

                <PermissionGate module="items" action="update">
                  <Button
                    onClick={() =>
                      router.push(`/inventory-masters/incentives/edit?id=${log.id}`)
                    }
                    className="bg-gradient-to-r from-accent to-accent-secondary hover:opacity-90"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Log
                  </Button>
                </PermissionGate>
              </div>
            </CardContent>
          </Card>

          {/* ── Detail grid ── */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* Log Details */}
            <Card>
              <CardContent className="pt-6">
                <h2 className="font-semibold mb-4 text-base flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent inline-block" />
                  Log Details
                </h2>
                <dl className="space-y-4 text-sm">

                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground">Effective Date</dt>
                    <dd className="font-medium">
                      {new Date(log.effectiveDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      })}
                    </dd>
                  </div>

                  {/* ✅ Edited By — avatar + full email */}
                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground">Edited By</dt>
                    <dd>
                      <EditedByBadge email={log.editedByEmail} />
                    </dd>
                  </div>

                  <div className="flex justify-between items-center">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-medium">
                      {log.createdAt
                        ? new Date(log.createdAt).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </dd>
                  </div>

                  {log.remarks && (
                    <div className="pt-2 border-t">
                      <dt className="text-muted-foreground mb-1">Remarks</dt>
                      <dd className="text-sm bg-muted/50 rounded-lg p-3">
                        {log.remarks}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Change Summary */}
            <Card>
              <CardContent className="pt-6">
                <h2 className="font-semibold mb-4 text-base flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent inline-block" />
                  Change Summary
                </h2>
                <ValueRow
                  label="NLC"
                  oldVal={Number(log.oldNlc)}
                  newVal={Number(log.newNlc)}
                  prefix="₹"
                />
                <ValueRow
                  label="Incentive"
                  oldVal={Number(log.oldIncentive)}
                  newVal={Number(log.newIncentive)}
                  suffix="%"
                />
                <ValueRow
                  label="Margin"
                  oldVal={Number(log.oldMargin)}
                  newVal={Number(log.newMargin)}
                  suffix="%"
                />
                <ValueRow
                  label="Offer Price"
                  oldVal={Number(log.oldOfferPrice)}
                  newVal={Number(log.newOfferPrice)}
                  prefix="₹"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </AuthenticatedLayout>
    </AuthGuard>
  );
}