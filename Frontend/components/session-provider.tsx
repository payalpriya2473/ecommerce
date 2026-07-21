"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { authAPI } from "@/lib/api"
import { sessionManager } from "@/lib/session-manager"


const PUBLIC_PATHS = ["/", "/login"]

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(300)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isLoggingOutRef = useRef(false)

  const isPublicPath = PUBLIC_PATHS.includes(pathname)

  const performLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return
    isLoggingOutRef.current = true

    sessionManager.stop()
    setShowWarning(false)
    if (countdownRef.current) clearInterval(countdownRef.current)

    try {
      const token = sessionStorage.getItem("authToken")
      if (token) await authAPI.logout(token)
    } catch { /* silent */ }

    sessionStorage.clear()
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("permissions:clear"))
    }
    router.replace("/login")
  }, [router])

  const handleStayLoggedIn = useCallback(() => {
    // NOTE: Since session is JWT-bound (24h), "Stay Logged In" just dismisses
    // the warning and resets the countdown display. The actual JWT expiry
    // cannot be extended from the client — user would need to re-login for a
    // fresh 24h token. Here we just close the dialog so they can finish work.
    setShowWarning(false)
    if (countdownRef.current) clearInterval(countdownRef.current)
    sessionManager.extendSession()
  }, [])

  useEffect(() => {
    let isMounted = true

    const setupSession = async () => {
      if (isPublicPath) {
        sessionManager.stop()
        return
      }

      const token = sessionStorage.getItem("authToken")
      if (!token) {
        router.replace("/")
        return
      }

      const verifyResult = await authAPI.verifyToken(token)
      if (!isMounted) return

      if (!verifyResult?.success) {
        await performLogout()
        return
      }

      sessionManager.start({
        onWarning: (secs) => {
          setSecondsLeft(secs)
          setShowWarning(true)

          if (countdownRef.current) clearInterval(countdownRef.current)
          countdownRef.current = setInterval(() => {
            setSecondsLeft(prev => {
              if (prev <= 1) {
                if (countdownRef.current) clearInterval(countdownRef.current)
                return 0
              }
              return prev - 1
            })
          }, 1000)
        },
        onLogout: performLogout,
      })
    }

    setupSession()

    return () => {
      isMounted = false
    }
  }, [isPublicPath, pathname, performLogout, router])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handleAuthExpired = async () => {
      await performLogout()
    }

    window.addEventListener("auth:expired", handleAuthExpired as EventListener)
    return () => {
      window.removeEventListener("auth:expired", handleAuthExpired as EventListener)
    }
  }, [performLogout])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionManager.stop()
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0")
  const secs = String(secondsLeft % 60).padStart(2, "0")

  return (
    <>
      {children}

      {/* JWT Expiry Warning Dialog */}
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4 text-center">
            {/* Icon */}
            <div className="h-14 w-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <svg className="h-7 w-7 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <h2 className="text-lg font-bold text-gray-900 mb-1">Session Expiring</h2>
            <p className="text-sm text-gray-500 mb-4">
              Your login session will expire in
            </p>

            {/* Countdown */}
            <div className="text-4xl font-bold text-orange-600 mb-1 tabular-nums">
              {mins}:{secs}
            </div>
            <p className="text-xs text-gray-400 mb-6">minutes : seconds</p>

            <p className="text-xs text-gray-400 mb-4">
              You will be automatically logged out when the timer reaches zero.
            </p>

            <div className="flex gap-3">
              <button
                onClick={performLogout}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Logout Now
              </button>
              <button
                onClick={handleStayLoggedIn}
                className="flex-1 px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium hover:bg-red-800 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
