"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { CUSTOMER_AUTH_EVENT, customerAuthAPI, saveTokens, saveCustomer } from "@/lib/api/customerApi";
import "./Loginpage.css";

type Mode = "login" | "register" | "otp" | "forgot" | "forgot-otp" | "reset-password" | "success";

interface ToastItem {
  id: number;
  html: string;
  type: "success" | "warning" | "info";
}

const perks = [
  { icon: "fas fa-gift", title: "Rs 200 Welcome Bonus", desc: "New members get flat Rs 200 off on first order" },
  { icon: "fas fa-bolt", title: "Early Access to Deals", desc: "Flash sales, exclusive offers before anyone else" },
  { icon: "fas fa-truck-fast", title: "Order Tracking", desc: "Real-time updates from dispatch to doorstep" },
  { icon: "fas fa-star", title: "Loyalty Rewards", desc: "Earn MB Points on every purchase" },
];

function getPwdStrength(val: string) {
  if (!val) return { score: 0, label: "Enter password", cls: "" };
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const cls = score <= 1 ? "weak" : score <= 2 ? "medium" : "strong";
  const labels = ["", "Weak – add numbers & symbols", "Good – add uppercase or symbols", "Strong password!", "Very Strong!"];
  return { score, label: labels[score] || "", cls };
}

function OtpBoxes({ values, onChange, error }: { values: string[]; onChange: (v: string[]) => void; error: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const handleInput = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...values]; next[i] = digit; onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };
  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !values[i] && i > 0) refs.current[i - 1]?.focus();
  };
  return (
    <div className="lp-otp-boxes">
      {values.map((v, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          className={`lp-otp-box${v ? " filled" : ""}${error ? " error" : ""}`}
          type="text" inputMode="numeric" maxLength={1} value={v}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)} />
      ))}
    </div>
  );
}

// ─── Helper: sync localStorage cart + wishlist to DB after login ─────────────
async function syncAfterLogin(accessToken: string) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  const BASE = "/api/customer";

  const readItems = (keys: string[]) => {
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore malformed local cache
      }
    }
    return [];
  };

  try {
    const wishlistItems = readItems(["motabhai-wishlist:guest", "motabhai-wishlist"]);
    if (wishlistItems.length > 0) {
      await fetch(`${BASE}/wishlist/sync`, {
        method: "POST", headers,
        body: JSON.stringify({ itemIds: wishlistItems.map((i: { id: string }) => i.id) }),
      });
    }
  } catch { /* ignore */ }

  try {
    const cartItems = readItems(["motabhai-cart:guest", "motabhai-cart"]);
    if (cartItems.length > 0) {
      await fetch(`${BASE}/cart/sync`, {
        method: "POST", headers,
        body: JSON.stringify({ items: cartItems.map((i: { id: string; qty: number; offerPrice: number }) => ({ itemId: i.id, qty: i.qty, priceSnapshot: i.offerPrice })) }),
      });
    }
  } catch { /* ignore */ }
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [tab, setTab] = useState<"login" | "register">("login");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpValues, setOtpValues] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState(false);
  const [otpTimer, setOtpTimer] = useState(30);
  const [otpTimerActive, setOtpTimerActive] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [successTitle, setSuccessTitle] = useState("Welcome to Motabhai!");
  const [successSub, setSuccessSub] = useState("Your account has been created.");

  // Login fields
  const [loginId, setLoginId] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [loginIdErr, setLoginIdErr] = useState(false);
  const [loginPwdErr, setLoginPwdErr] = useState(false);
  const [showLoginPwd, setShowLoginPwd] = useState(false);

  // Register fields
  const [regFirst, setRegFirst] = useState("");
  const [regLast, setRegLast] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPwd, setRegPwd] = useState("");
  const [regCPwd, setRegCPwd] = useState("");
  const [regDob, setRegDob] = useState("");
  const [agree, setAgree] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [showRegCPwd, setShowRegCPwd] = useState(false);
  const [regErrors, setRegErrors] = useState<Record<string, boolean>>({});
  const [emailValid, setEmailValid] = useState(false);

  // Forgot password fields
  const [forgotId, setForgotId] = useState("");
  const [forgotOtpValues, setForgotOtpValues] = useState(["", "", "", "", "", ""]);
  const [forgotOtpError, setForgotOtpError] = useState(false);
  const [forgotOtpPhone, setForgotOtpPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showNewCPwd, setShowNewCPwd] = useState(false);

  // Track which flow triggered OTP (for verify step)
  const pendingRegData = useRef<{ firstName: string; lastName: string } | null>(null);

  const pwdStrength = getPwdStrength(regPwd);
  const pwdConfirmMatch = regCPwd.length > 0 && regCPwd === regPwd;
  const pwdConfirmMismatch = regCPwd.length > 0 && regCPwd !== regPwd;

  useEffect(() => {
    if (!otpTimerActive) return;
    if (otpTimer <= 0) { setOtpTimerActive(false); return; }
    const t = setInterval(() => setOtpTimer((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [otpTimerActive, otpTimer]);

  useEffect(() => {
    if (otpValues.every((v) => v.length === 1)) {
      setTimeout(() => verifyOtp(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpValues]);

  const showToast = (html: string, type: ToastItem["type"] = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, html, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  const startOtpTimer = () => { setOtpTimer(30); setOtpTimerActive(true); };

  const showDevOtpIfAvailable = (otp?: string, label = "OTP") => {
    if (!otp) return;
    showToast(`<i class="fas fa-key"></i> Dev ${label}: <strong>${otp}</strong>`, "info");
  };

  const showOtpDeliveryToast = (label: string, otp?: string, delivery?: "dev" | "sms" | "unconfigured", message?: string) => {
    if (delivery === "dev") {
      showToast(`<i class="fas fa-circle-info"></i> ${message || "Development mode is active, so OTP is shown here instead of sending SMS."}`, "info");
      showDevOtpIfAvailable(otp, label);
      return;
    }

    if (delivery === "sms") {
      showToast('<i class="fas fa-mobile-screen"></i> OTP sent to your mobile!', "info");
      return;
    }

    if (message) {
      showToast(`<i class="fas fa-circle-exclamation"></i> ${message}`, "warning");
    }
  };

  const showOtp = (phone: string) => {
    setOtpPhone(phone);
    setOtpValues(["", "", "", "", "", ""]);
    setOtpError(false);
    setMode("otp");
    startOtpTimer();
  };

  // ─── Handle login success ───────────────────────────────────────────────
  const handleAuthSuccess = async (data: { customer: { firstName?: string }; accessToken: string; refreshToken: string }, isRegister = false) => {
    saveTokens(data.accessToken, data.refreshToken);
    saveCustomer(data.customer as Parameters<typeof saveCustomer>[0]);
    await syncAfterLogin(data.accessToken);
    window.dispatchEvent(new Event(CUSTOMER_AUTH_EVENT));
    setSuccessTitle(isRegister ? `Welcome to Motabhai! 🎉` : `Welcome Back, ${data.customer.firstName || ""}!`);
    // Return the customer to wherever they came from (e.g. ?redirect=/checkout)
    const requestedRedirect = new URLSearchParams(window.location.search).get("redirect");
    const redirectTarget =
      requestedRedirect && requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
        ? requestedRedirect
        : "/account";

    setSuccessSub(
      isRegister
        ? "Your account is ready. You earned Rs 200 welcome bonus!"
        : redirectTarget === "/checkout"
          ? "You're now signed in. Taking you back to checkout..."
          : "You're now signed in. Redirecting..."
    );
    setMode("success");
    setTimeout(() => { window.location.href = redirectTarget; }, 2500);
  };

  // ─── Login ──────────────────────────────────────────────────────────────
  const doLogin = async () => {
    let valid = true;
    setLoginIdErr(!loginId); setLoginPwdErr(!loginPwd);
    if (!loginId || !loginPwd) valid = false;
    if (!valid) return;

    const isPhone = /^\d{10}$/.test(loginId.replace(/\s/g, ""));

    if (isPhone) {
      setLoading(true);
      const res = await customerAuthAPI.sendOtp(loginId.replace(/\s/g, ""), "login");
      setLoading(false);
      if (!res.success) { showToast(`<i class="fas fa-circle-exclamation"></i> ${res.message}`, "warning"); return; }
      const formatted = "+91 " + loginId.replace(/\s/g, "").replace(/(\d{5})(\d{5})/, "$1 $2");
      showOtpDeliveryToast("login OTP", res.data?.otp, res.data?.delivery, res.data?.message);
      showOtp(formatted);
    } else {
      setLoading(true);
      const res = await customerAuthAPI.login(loginId, loginPwd);
      setLoading(false);
      if (!res.success || !res.data) {
        showToast(`<i class="fas fa-circle-exclamation"></i> ${res.message || "Invalid email or password"}`, "warning");
        return;
      }
      await handleAuthSuccess(res.data);
    }
  };

  // ─── Register ───────────────────────────────────────────────────────────
  const doRegister = async () => {
    const errors: Record<string, boolean> = {};
    if (!regFirst) errors.first = true;
    if (!regLast) errors.last = true;
    if (!regPhone || !/^\d{10}$/.test(regPhone)) errors.phone = true;
    if (!regEmail || !regEmail.includes("@")) errors.email = true;
    if (!regPwd || regPwd.length < 8) errors.pwd = true;
    if (regPwd !== regCPwd) errors.cpwd = true;
    setRegErrors(errors);
    if (Object.keys(errors).length > 0) { showToast('<i class="fas fa-circle-exclamation"></i> Please fix the errors above', "warning"); return; }
    if (!agree) { showToast('<i class="fas fa-exclamation-triangle"></i> Please accept the Terms', "warning"); return; }

    setLoading(true);
    const res = await customerAuthAPI.register({ firstName: regFirst, lastName: regLast, phone: regPhone, email: regEmail, password: regPwd, dob: regDob || undefined });
    setLoading(false);

    if (!res.success || !res.data) {
      showToast(`<i class="fas fa-circle-exclamation"></i> ${res.message || "Registration failed"}`, "warning");
      return;
    }

    await handleAuthSuccess(res.data, true);
  };

  // ─── Verify OTP (login flow) ─────────────────────────────────────────────
  const verifyOtp = async () => {
    const otp = otpValues.join("");
    if (otp.length < 6) { showToast('<i class="fas fa-circle-exclamation"></i> Enter all 6 digits', "warning"); return; }

    setLoading(true);
    const phone = otpPhone.replace(/\D/g, "").slice(-10);
    const res = await customerAuthAPI.verifyOtp({
      phone,
      otp,
      purpose: tab === "register" ? "register" : "login",
      firstName: pendingRegData.current?.firstName,
      lastName: pendingRegData.current?.lastName,
    });
    setLoading(false);

    if (!res.success || !res.data) {
      setOtpError(true);
      showToast(`<i class="fas fa-xmark-circle"></i> ${res.message || "Invalid OTP"}`, "warning");
      setTimeout(() => setOtpError(false), 1000);
      return;
    }

    await handleAuthSuccess(res.data, tab === "register");
  };

  // ─── Forgot Password: send OTP or email link ────────────────────────────
  const sendResetLink = async () => {
    if (!forgotId) { showToast('<i class="fas fa-circle-exclamation"></i> Please enter email or mobile', "warning"); return; }
    const isPhone = /^\d{10}$/.test(forgotId.replace(/\s/g, ""));

    if (isPhone) {
      setLoading(true);
      const res = await customerAuthAPI.forgotPasswordSendOtp(forgotId.replace(/\s/g, ""));
      setLoading(false);
      if (!res.success) { showToast(`<i class="fas fa-circle-exclamation"></i> ${res.message}`, "warning"); return; }
      setForgotOtpPhone(forgotId.replace(/\s/g, ""));
      setForgotOtpValues(["", "", "", "", "", ""]);
      setForgotOtpError(false);
      showOtpDeliveryToast("reset OTP", res.data?.otp, res.data?.delivery, res.data?.message);
      setMode("forgot-otp");
      startOtpTimer();
    } else {
      setLoading(true);
      const res = await customerAuthAPI.forgotPasswordSendEmail(forgotId);
      setLoading(false);
      if (!res.success) { showToast(`<i class="fas fa-circle-exclamation"></i> ${res.message}`, "warning"); return; }
      showToast('<i class="fas fa-envelope"></i> Reset link sent! Check your email.', "success");
      setMode("login"); setTab("login");
    }
  };

  // ─── Forgot Password: verify OTP then proceed to reset ──────────────────
  const verifyForgotOtp = async () => {
    const otp = forgotOtpValues.join("");
    if (otp.length < 6) { showToast('<i class="fas fa-circle-exclamation"></i> Enter all 6 digits', "warning"); return; }
    setMode("reset-password");
  };

  // ─── Forgot Password: submit new password ───────────────────────────────
  const doResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) { showToast('<i class="fas fa-circle-exclamation"></i> Password must be at least 8 characters', "warning"); return; }
    if (newPassword !== newPasswordConfirm) { showToast('<i class="fas fa-circle-exclamation"></i> Passwords do not match', "warning"); return; }

    const otp = forgotOtpValues.join("");
    setLoading(true);
    const res = await customerAuthAPI.resetPassword({ phone: forgotOtpPhone, otp, newPassword });
    setLoading(false);

    if (!res.success) { showToast(`<i class="fas fa-circle-exclamation"></i> ${res.message}`, "warning"); return; }
    showToast('<i class="fas fa-check-circle"></i> Password reset! Please login.', "success");
    setMode("login"); setTab("login");
    setNewPassword(""); setNewPasswordConfirm(""); setForgotOtpValues(["", "", "", "", "", ""]);
  };

  // ─── Social Login ───────────────────────────────────────────────────────
  const socialLogin = async (provider: "google" | "facebook") => {
    showToast(`<i class="fab fa-${provider}"></i> Connecting to ${provider === "google" ? "Google" : "Facebook"}...`, "info");
    showToast(`<i class="fas fa-info-circle"></i> Social login needs OAuth setup`, "warning");
  };

  const resendOtp = async () => {
    const phone = otpPhone.replace(/\D/g, "").slice(-10);
    setLoading(true);
    await customerAuthAPI.sendOtp(phone, tab === "register" ? "register" : "login");
    setLoading(false);
    setOtpValues(["", "", "", "", "", ""]); setOtpError(false);
    startOtpTimer();
    showToast('<i class="fas fa-paper-plane"></i> New OTP sent!', "info");
  };

  const isOtpMode = mode === "otp";
  const isForgotMode = mode === "forgot" || mode === "forgot-otp" || mode === "reset-password";
  const isSuccessMode = mode === "success";
  const showTabSwitcher = !isOtpMode && !isForgotMode && !isSuccessMode;

  return (
    <div className="lp-root">
      <div className="lp-page-wrap">
        <div className="lp-left-panel">
          <div className="lp-orb lp-orb-1" /><div className="lp-orb lp-orb-2" /><div className="lp-orb lp-orb-3" />
          <div className="lp-left-content">
            <div className="lp-left-brand"><div className="lp-left-brand-icon">M</div><div className="lp-left-brand-name">Motabhai</div></div>
            <div className="lp-left-headline">India&apos;s Most Trusted<br /><span>Electronics Store</span></div>
            <div className="lp-left-sub">Join 50 lakh+ happy customers. Get exclusive deals, track orders, and manage everything in one place.</div>
            <div className="lp-left-perks">
              {perks.map((p, i) => (
                <div key={i} className="lp-left-perk" style={{ animationDelay: `${(i + 1) * 0.1}s` }}>
                  <i className={p.icon} />
                  <div className="lp-perk-text"><strong>{p.title}</strong>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lp-right-panel">
          <div className="lp-form-container">
            {showTabSwitcher && (
              <div className="lp-tab-switcher">
                <button className={`lp-tab-btn${tab === "login" ? " active" : ""}`} onClick={() => { setTab("login"); setMode("login"); }}>Sign In</button>
                <button className={`lp-tab-btn${tab === "register" ? " active" : ""}`} onClick={() => { setTab("register"); setMode("register"); }}>Create Account</button>
              </div>
            )}

            {/* ─── LOGIN ─── */}
            {mode === "login" && (
              <div className="lp-form-panel">
                <div className="lp-form-title">Welcome back!</div>
                <div className="lp-form-subtitle">Sign in to your Motabhai account to continue</div>
                <div className="lp-social-row">
                  <button className="lp-social-btn" onClick={() => socialLogin("google")}><i className="fab fa-google lp-g-icon" /> Continue with Google</button>
                  <button className="lp-social-btn" onClick={() => socialLogin("facebook")}><i className="fab fa-facebook lp-fb-icon" /> Facebook</button>
                </div>
                <div className="lp-divider"><span>or sign in with email / mobile</span></div>
                <div className="lp-fg">
                  <label><i className="fas fa-envelope" /> Email or Mobile Number <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-user lp-prefix-icon" />
                    <input className={`lp-finput${loginIdErr ? " error" : ""}`} type="text" placeholder="Email or 10-digit mobile" value={loginId} onChange={(e) => { setLoginId(e.target.value); setLoginIdErr(false); }} />
                  </div>
                  {loginIdErr && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Please enter valid email or mobile</div>}
                </div>
                <div className="lp-fg">
                  <label><i className="fas fa-lock" /> Password <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-lock lp-prefix-icon" />
                    <input className={`lp-finput${loginPwdErr ? " error" : ""}`} type={showLoginPwd ? "text" : "password"} placeholder="Enter your password" value={loginPwd} onChange={(e) => { setLoginPwd(e.target.value); setLoginPwdErr(false); }} />
                    <i className={`fas ${showLoginPwd ? "fa-eye-slash" : "fa-eye"} lp-suffix-icon`} onClick={() => setShowLoginPwd((v) => !v)} />
                  </div>
                  {loginPwdErr && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Password is required</div>}
                </div>
                <div className="lp-remember-row">
                  <label className="lp-remember-label"><input type="checkbox" defaultChecked /> Remember me</label>
                  <button className="lp-forgot-link" onClick={() => setMode("forgot")}>Forgot Password?</button>
                </div>
                <button className="lp-submit-btn" disabled={loading} onClick={doLogin}>
                  {loading ? <><i className="fas fa-spinner fa-spin" /> Please wait...</> : <><i className="fas fa-right-to-bracket" /> Sign In to My Account</>}
                </button>
                <div className="lp-switch-link">Don&apos;t have an account? <button onClick={() => { setTab("register"); setMode("register"); }}>Create one free →</button></div>
                <div className="lp-ssl-note"><i className="fas fa-shield-halved" style={{ color: "var(--green500)" }} /> Your login is protected by 256-bit SSL encryption</div>
              </div>
            )}

            {/* ─── REGISTER ─── */}
            {mode === "register" && (
              <div className="lp-form-panel">
                <div className="lp-form-title">Create Account</div>
                <div className="lp-form-subtitle">Join Motabhai and get Rs 200 off your first order!</div>
                <div className="lp-social-row">
                  <button className="lp-social-btn" onClick={() => socialLogin("google")}><i className="fab fa-google lp-g-icon" /> Sign up with Google</button>
                  <button className="lp-social-btn" onClick={() => socialLogin("facebook")}><i className="fab fa-facebook lp-fb-icon" /> Facebook</button>
                </div>
                <div className="lp-divider"><span>or register with email</span></div>
                <div className="lp-row-2">
                  <div className="lp-fg">
                    <label>First Name <span className="lp-req">*</span></label>
                    <div className="lp-input-wrap"><i className="fas fa-user lp-prefix-icon" /><input className={`lp-finput${regErrors.first ? " error" : ""}`} type="text" placeholder="Saurabh" value={regFirst} onChange={(e) => { setRegFirst(e.target.value); setRegErrors((p) => ({ ...p, first: false })); }} /></div>
                    {regErrors.first && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Required</div>}
                  </div>
                  <div className="lp-fg">
                    <label>Last Name <span className="lp-req">*</span></label>
                    <div className="lp-input-wrap"><i className="fas fa-user lp-prefix-icon" /><input className={`lp-finput${regErrors.last ? " error" : ""}`} type="text" placeholder="Kapoor" value={regLast} onChange={(e) => { setRegLast(e.target.value); setRegErrors((p) => ({ ...p, last: false })); }} /></div>
                    {regErrors.last && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Required</div>}
                  </div>
                </div>
                <div className="lp-fg">
                  <label>Mobile Number <span className="lp-req">*</span></label>
                  <div className="lp-phone-row">
                    <select className="lp-country-code"><option>🇮🇳 +91</option></select>
                    <div className="lp-input-wrap"><i className="fas fa-phone lp-prefix-icon" /><input className={`lp-finput${regErrors.phone ? " error" : ""}`} type="tel" placeholder="98765 43210" maxLength={10} value={regPhone} onChange={(e) => { setRegPhone(e.target.value.replace(/\D/g, "")); setRegErrors((p) => ({ ...p, phone: false })); }} /></div>
                  </div>
                  {regErrors.phone && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Valid 10-digit number required</div>}
                </div>
                <div className="lp-fg">
                  <label>Email Address <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-envelope lp-prefix-icon" />
                    <input className={`lp-finput${regErrors.email ? " error" : ""}${emailValid ? " success" : ""}`} type="email" placeholder="you@email.com" value={regEmail} onChange={(e) => { setRegEmail(e.target.value); setEmailValid(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)); setRegErrors((p) => ({ ...p, email: false })); }} />
                    {emailValid && <i className="fas fa-circle-check lp-suffix-icon" style={{ color: "var(--green500)" }} />}
                  </div>
                  {regErrors.email && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Valid email required</div>}
                </div>
                <div className="lp-fg">
                  <label>Password <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-lock lp-prefix-icon" />
                    <input className={`lp-finput${regErrors.pwd ? " error" : ""}`} type={showRegPwd ? "text" : "password"} placeholder="Min. 8 characters" value={regPwd} onChange={(e) => { setRegPwd(e.target.value); setRegErrors((p) => ({ ...p, pwd: false })); }} />
                    <i className={`fas ${showRegPwd ? "fa-eye-slash" : "fa-eye"} lp-suffix-icon`} onClick={() => setShowRegPwd((v) => !v)} />
                  </div>
                  {regPwd.length > 0 && (
                    <div className="lp-pwd-strength">
                      <div className="lp-pwd-bars">{[0,1,2,3].map((i) => <div key={i} className={`lp-pwd-bar${i < pwdStrength.score ? " " + pwdStrength.cls : ""}`} />)}</div>
                      <div className={`lp-pwd-label ${pwdStrength.cls}`}>{pwdStrength.label}</div>
                    </div>
                  )}
                  {regErrors.pwd && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Min. 8 characters required</div>}
                </div>
                <div className="lp-fg">
                  <label>Confirm Password <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-lock lp-prefix-icon" />
                    <input className={`lp-finput${regErrors.cpwd || pwdConfirmMismatch ? " error" : ""}${pwdConfirmMatch ? " success" : ""}`} type={showRegCPwd ? "text" : "password"} placeholder="Re-enter password" value={regCPwd} onChange={(e) => { setRegCPwd(e.target.value); setRegErrors((p) => ({ ...p, cpwd: false })); }} />
                    <i className={`fas ${showRegCPwd ? "fa-eye-slash" : "fa-eye"} lp-suffix-icon`} onClick={() => setShowRegCPwd((v) => !v)} />
                  </div>
                  {(regErrors.cpwd || pwdConfirmMismatch) && <div className="lp-ferror"><i className="fas fa-circle-exclamation" /> Passwords do not match</div>}
                </div>
                <div className="lp-fg">
                  <label>Date of Birth <span style={{ color: "var(--gray400)", fontWeight: 400 }}>(Optional)</span></label>
                  <div className="lp-input-wrap"><i className="fas fa-cake-candles lp-prefix-icon" /><input className="lp-finput" type="date" value={regDob} onChange={(e) => setRegDob(e.target.value)} /></div>
                </div>
                <div className="lp-agree-row">
                  <input type="checkbox" id="agreeChk" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <label htmlFor="agreeChk">I agree to Motabhai&apos;s <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.</label>
                </div>
                <button className="lp-submit-btn" disabled={loading} onClick={doRegister}>
                  {loading ? <><i className="fas fa-spinner fa-spin" /> Please wait...</> : <><i className="fas fa-user-plus" /> Create My Account</>}
                </button>
                <div className="lp-switch-link">Already have an account? <button onClick={() => { setTab("login"); setMode("login"); }}>Sign in →</button></div>
              </div>
            )}

            {/* ─── OTP (login flow) ─── */}
            {mode === "otp" && (
              <div className="lp-otp-panel">
                <button className="lp-otp-back" onClick={() => setMode(tab)}><i className="fas fa-arrow-left" /> Back</button>
                <div className="lp-otp-icon"><i className="fas fa-mobile-screen-button" /></div>
                <div className="lp-otp-title">Verify Your Number</div>
                <div className="lp-otp-sub">We&apos;ve sent a 6-digit OTP to <strong>{otpPhone}</strong>.</div>
                <OtpBoxes values={otpValues} onChange={setOtpValues} error={otpError} />
                <div className="lp-otp-resend">
                  {otpTimerActive
                    ? <span>Resend OTP in <span className="lp-otp-timer">{otpTimer}s</span></span>
                    : <button className="lp-otp-resend-link" onClick={resendOtp}>Resend OTP</button>}
                </div>
                <button className="lp-submit-btn" disabled={loading} onClick={verifyOtp}>
                  {loading ? <><i className="fas fa-spinner fa-spin" /> Please wait...</> : <><i className="fas fa-check-circle" /> Verify OTP</>}
                </button>
              </div>
            )}

            {/* ─── FORGOT ─── */}
            {mode === "forgot" && (
              <div className="lp-forgot-panel">
                <button className="lp-otp-back" onClick={() => { setMode("login"); setTab("login"); }}><i className="fas fa-arrow-left" /> Back to Login</button>
                <div className="lp-otp-icon"><i className="fas fa-key" /></div>
                <div className="lp-otp-title">Reset Password</div>
                <div className="lp-otp-sub">Enter your registered email or mobile. We&apos;ll send a reset link / OTP.</div>
                <div className="lp-fg" style={{ marginBottom: 20 }}>
                  <label>Email or Mobile <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-user lp-prefix-icon" />
                    <input className="lp-finput" type="text" placeholder="you@email.com or 98765 43210" value={forgotId} onChange={(e) => setForgotId(e.target.value)} />
                  </div>
                </div>
                <button className="lp-submit-btn" disabled={loading} onClick={sendResetLink}>
                  {loading ? <><i className="fas fa-spinner fa-spin" /> Please wait...</> : <><i className="fas fa-paper-plane" /> Send Reset Link / OTP</>}
                </button>
              </div>
            )}

            {/* ─── FORGOT OTP ─── */}
            {mode === "forgot-otp" && (
              <div className="lp-otp-panel">
                <button className="lp-otp-back" onClick={() => setMode("forgot")}><i className="fas fa-arrow-left" /> Back</button>
                <div className="lp-otp-icon"><i className="fas fa-mobile-screen-button" /></div>
                <div className="lp-otp-title">Verify Your Number</div>
                <div className="lp-otp-sub">We&apos;ve sent a 6-digit OTP to <strong>+91 {forgotOtpPhone}</strong>.</div>
                <OtpBoxes values={forgotOtpValues} onChange={setForgotOtpValues} error={forgotOtpError} />
                <div className="lp-otp-resend">
                  {otpTimerActive
                    ? <span>Resend OTP in <span className="lp-otp-timer">{otpTimer}s</span></span>
                    : <button className="lp-otp-resend-link" onClick={async () => {
                        setLoading(true);
                        const res = await customerAuthAPI.forgotPasswordSendOtp(forgotOtpPhone);
                        setLoading(false);
                        setForgotOtpValues(["", "", "", "", "", ""]);
                        startOtpTimer();
                        showOtpDeliveryToast("reset OTP", res.data?.otp, res.data?.delivery, res.data?.message);
                        showToast('<i class="fas fa-paper-plane"></i> New OTP generated!', "info");
                      }}>Resend OTP</button>}
                </div>
                <button className="lp-submit-btn" disabled={loading} onClick={verifyForgotOtp}>
                  {loading ? <><i className="fas fa-spinner fa-spin" /> Please wait...</> : <><i className="fas fa-check-circle" /> Verify OTP</>}
                </button>
              </div>
            )}

            {/* ─── RESET PASSWORD ─── */}
            {mode === "reset-password" && (
              <div className="lp-forgot-panel">
                <button className="lp-otp-back" onClick={() => setMode("forgot-otp")}><i className="fas fa-arrow-left" /> Back</button>
                <div className="lp-otp-icon"><i className="fas fa-lock" /></div>
                <div className="lp-otp-title">Set New Password</div>
                <div className="lp-otp-sub">Choose a strong new password for your account.</div>
                <div className="lp-fg">
                  <label>New Password <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-lock lp-prefix-icon" />
                    <input className="lp-finput" type={showNewPwd ? "text" : "password"} placeholder="Min. 8 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    <i className={`fas ${showNewPwd ? "fa-eye-slash" : "fa-eye"} lp-suffix-icon`} onClick={() => setShowNewPwd(v => !v)} />
                  </div>
                </div>
                <div className="lp-fg" style={{ marginBottom: 20 }}>
                  <label>Confirm New Password <span className="lp-req">*</span></label>
                  <div className="lp-input-wrap">
                    <i className="fas fa-lock lp-prefix-icon" />
                    <input className="lp-finput" type={showNewCPwd ? "text" : "password"} placeholder="Re-enter new password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} />
                    <i className={`fas ${showNewCPwd ? "fa-eye-slash" : "fa-eye"} lp-suffix-icon`} onClick={() => setShowNewCPwd(v => !v)} />
                  </div>
                </div>
                <button className="lp-submit-btn" disabled={loading} onClick={doResetPassword}>
                  {loading ? <><i className="fas fa-spinner fa-spin" /> Please wait...</> : <><i className="fas fa-shield-halved" /> Reset My Password</>}
                </button>
              </div>
            )}

            {/* ─── SUCCESS ─── */}
            {mode === "success" && (
              <div className="lp-success-state">
                <div className="lp-success-circle"><i className="fas fa-check" /></div>
                <div className="lp-success-title">{successTitle}</div>
                <div className="lp-success-sub">{successSub}</div>
                <div className="lp-progress-track"><div className="lp-progress-bar" /></div>
                {/* <Link href="/account" className="lp-submit-btn" style={{ display: "flex", justifyContent: "center", textDecoration: "none" }}>
                  <i className="fas fa-user-circle" /> Go to My Account
                </Link> */}
              </div>
            )}

          </div>
        </div>
      </div>

      <footer className="lp-mini-footer">
        <div className="lp-footer-links">
          {[
            { href: "/", icon: "fas fa-house", label: "Home" },
            { href: "/offers", icon: "fas fa-bolt", label: "Offers" },
            { href: "/cart", icon: "fas fa-shopping-cart", label: "Cart" },
            // { href: "/account", icon: "fas fa-user", label: "My Account" },
            { href: "/faq", icon: "fas fa-circle-question", label: "Help" },
          ].map((l) => (
            <Link key={l.href} href={l.href}><i className={l.icon} /> {l.label}</Link>
          ))}
        </div>
        <div className="lp-footer-copy">&copy; 2026 Motabhai Electronics. All rights reserved.</div>
      </footer>

      <div className="lp-toast-wrap">
        {toasts.map((t) => <div key={t.id} className={`lp-toast ${t.type}`} dangerouslySetInnerHTML={{ __html: t.html }} />)}
      </div>
    </div>
  );
}
