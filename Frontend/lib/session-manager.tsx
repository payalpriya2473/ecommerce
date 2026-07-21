/**
 * Session Manager for Motabhai Enterprise Suite
 *
 * Behaviour:
 * - Session lasts the full 24 hours of the JWT lifetime
 * - User activity does NOT reset the timer (no inactivity logout)
 * - A warning dialog appears 5 minutes before the JWT expires
 * - On expiry → sessionStorage cleared → redirect to login
 *
 * To change the warning lead time, update WARNING_BEFORE_MS below.
 */

const WARNING_BEFORE_MS = 5 * 60 * 1000  // warn 5 minutes before JWT expires

type SessionCallbacks = {
  onWarning: (secondsLeft: number) => void  // fires when expiry is near
  onLogout:  ()                  => void    // fires on expiry
}

class SessionManager {
  private expiryTimer:  ReturnType<typeof setTimeout> | null = null
  private warningTimer: ReturnType<typeof setTimeout> | null = null
  private callbacks:    SessionCallbacks | null = null
  private isActive:     boolean = false

  /**
   * Start the session clock.
   * Reads the JWT from sessionStorage, schedules a warning and a logout
   * timed exactly to the token's exp claim.
   */
  start(callbacks: SessionCallbacks) {
    this.stop()  // clear any previous timers
    this.callbacks = callbacks
    this.isActive  = true
    this.scheduleFromJWT()
  }

  /** Stop session watching. Call this on manual logout. */
  stop() {
    this.isActive = false
    this.clearTimers()
    this.callbacks = null
  }

  /** Call from the "Stay Logged In" button — re-reads JWT and reschedules */
  extendSession() {
    if (this.isActive) this.scheduleFromJWT()
  }

  private scheduleFromJWT() {
    this.clearTimers()

    try {
      const token = sessionStorage.getItem("authToken")
      if (!token) {
        this.callbacks?.onLogout()
        return
      }

      // Decode JWT payload without verifying signature (client-side read only)
      const payload       = JSON.parse(atob(token.split(".")[1]))
      const expiryMs      = payload.exp * 1000        // exp is in seconds
      const now           = Date.now()
      const msUntilExpiry = expiryMs - now

      if (msUntilExpiry <= 0) {
        // Token already expired — logout immediately
        this.callbacks?.onLogout()
        return
      }

      // Schedule warning dialog
      const msUntilWarning = msUntilExpiry - WARNING_BEFORE_MS
      if (msUntilWarning > 0) {
        this.warningTimer = setTimeout(() => {
          const secondsLeft = Math.floor(WARNING_BEFORE_MS / 1000)
          this.callbacks?.onWarning(secondsLeft)
        }, msUntilWarning)
      } else {
        // Less than 5 min remaining right now — show warning immediately
        const secondsLeft = Math.floor(msUntilExpiry / 1000)
        this.callbacks?.onWarning(secondsLeft)
      }

      // Schedule hard logout at exact JWT expiry
      this.expiryTimer = setTimeout(() => {
        this.callbacks?.onLogout()
      }, msUntilExpiry)

    } catch {
      // Malformed token — treat as expired
      this.callbacks?.onLogout()
    }
  }

  private clearTimers() {
    if (this.expiryTimer)  { clearTimeout(this.expiryTimer);  this.expiryTimer  = null }
    if (this.warningTimer) { clearTimeout(this.warningTimer); this.warningTimer = null }
  }
}

// Singleton — one instance for the whole app
export const sessionManager = new SessionManager()