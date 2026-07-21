"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { customerAuthAPI } from "@/lib/api/customerApi";

function ResetPasswordContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleReset = async () => {
    if (newPassword.length < 8) { setMsg("Password must be at least 8 characters"); return; }
    if (newPassword !== confirm) { setMsg("Passwords do not match"); return; }
    setLoading(true);
    const res = await customerAuthAPI.resetPassword({ token, newPassword });
    setLoading(false);
    if (!res.success) { setMsg(res.message || "Something went wrong"); return; }
    setMsg("Password reset successfully! Redirecting to login...");
    setTimeout(() => router.push("/login"), 2500);
  };

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h2>Set New Password</h2>
      {!token && <p style={{ color: "red" }}>Invalid or missing reset token.</p>}
      {token && (<>
        <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 12, padding: 10, fontSize: 16 }} />
        <input type="password" placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} style={{ display: "block", width: "100%", marginBottom: 12, padding: 10, fontSize: 16 }} />
        <button onClick={handleReset} disabled={loading} style={{ width: "100%", padding: 12, background: "#e63946", color: "#fff", border: "none", borderRadius: 8, fontSize: 16, cursor: "pointer" }}>
          {loading ? "Please wait..." : "Reset Password"}
        </button>
        {msg && <p style={{ marginTop: 12, color: msg.includes("success") ? "green" : "red" }}>{msg}</p>}
      </>)}
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetPasswordContent /></Suspense>;
}