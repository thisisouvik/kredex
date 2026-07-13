"use client"

import { useState } from "react"
import Image from "next/image"
import { joinWaitlist } from "@/app/actions/waitlist"
import { ArrowRight, User, Mail, CheckCircle2, Loader2 } from "lucide-react"

export const WaitlistHero = () => {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !fullName) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("error")
      setErrorMessage("Please enter a valid email address.")
      return
    }

    setStatus("loading")
    setErrorMessage("")

    try {
      const result = await joinWaitlist(email, fullName);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      setStatus("success")
      setEmail("")
      setFullName("")
    } catch (err: unknown) {
      console.error("Waitlist error:", err)
      setStatus("error")
      const message = err instanceof Error ? err.message : "Failed to join waitlist. Try again."
      setErrorMessage(message)
    }
  }

  return (
    <>
      <style>{`
        /* ---- Animated background particles ---- */
        @keyframes float-up {
          0%   { transform: translateY(100vh) scale(0);  opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(-10vh) scale(1);  opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes orbit {
          from { transform: rotate(0deg) translateX(180px) rotate(0deg); }
          to   { transform: rotate(360deg) translateX(180px) rotate(-360deg); }
        }
        @keyframes orbit-reverse {
          from { transform: rotate(0deg) translateX(240px) rotate(0deg); }
          to   { transform: rotate(-360deg) translateX(240px) rotate(360deg); }
        }
        @keyframes fade-slide-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes success-pop {
          0%   { opacity: 0; transform: scale(0.85); }
          60%  { transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }

        .particle {
          position: absolute;
          border-radius: 50%;
          animation: float-up linear infinite;
          pointer-events: none;
        }
        .glow-core {
          animation: pulse-glow 6s ease-in-out infinite;
        }
        .orbit-dot {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #2563eb;
          top: 50%;
          left: 50%;
          margin: -3px 0 0 -3px;
          animation: orbit 12s linear infinite;
          box-shadow: 0 0 12px 3px rgba(37,99,235,0.7);
        }
        .orbit-dot-2 {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #60a5fa;
          top: 50%;
          left: 50%;
          margin: -2px 0 0 -2px;
          animation: orbit-reverse 18s linear infinite;
          box-shadow: 0 0 10px 3px rgba(96,165,250,0.5);
        }
        .hero-content {
          animation: fade-slide-up 0.8s ease forwards;
        }
        .hero-content-delay {
          animation: fade-slide-up 0.8s ease 0.15s both;
        }
        .hero-content-delay-2 {
          animation: fade-slide-up 0.8s ease 0.3s both;
        }
        .success-anim {
          animation: success-pop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards;
        }

        /* ---- Input focus ring ---- */
        .wl-input:focus {
          outline: none;
          border-color: rgba(37,99,235,0.45);
          box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
        }
        .wl-btn:hover:not(:disabled) {
          background: #1d4ed8;
          box-shadow: 0 0 28px rgba(37,99,235,0.55);
        }
        .wl-btn:active:not(:disabled) {
          transform: scale(0.97);
        }
      `}</style>

      <div
        className="relative w-full min-h-screen flex flex-col items-center justify-center overflow-hidden py-12"
        style={{ background: "#06060a" }}
      >
        {/* ── Animated Background ── */}
        {/* Deep radial glow behind content */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 55%, rgba(23,55,140,0.22) 0%, transparent 70%)",
          }}
        />

        {/* Grid lines */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
            maskImage:
              "radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)",
          }}
        />

        {/* Floating particles */}
        {[
          { left: "10%", w: 4, delay: "0s",   dur: "14s", color: "rgba(59,130,246,0.5)" },
          { left: "22%", w: 3, delay: "3s",   dur: "18s", color: "rgba(99,179,255,0.4)" },
          { left: "40%", w: 5, delay: "1.5s", dur: "11s", color: "rgba(37,99,235,0.45)" },
          { left: "58%", w: 3, delay: "5s",   dur: "16s", color: "rgba(96,165,250,0.4)" },
          { left: "75%", w: 4, delay: "2s",   dur: "13s", color: "rgba(59,130,246,0.5)" },
          { left: "88%", w: 3, delay: "7s",   dur: "20s", color: "rgba(147,197,253,0.35)" },
        ].map((p, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: p.left,
              bottom: "-10px",
              width: p.w,
              height: p.w,
              background: p.color,
              animationDelay: p.delay,
              animationDuration: p.dur,
              boxShadow: `0 0 ${p.w * 3}px ${p.color}`,
            }}
          />
        ))}

        {/* Orbiting dots around centre-glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 1,
            height: 1,
          }}
        >
          <div className="orbit-dot" />
          <div className="orbit-dot-2" />
        </div>

        {/* ── Hero Card ── */}
        <div className="relative z-10 w-full max-w-md mx-auto px-5 flex flex-col items-center text-center">

          {/* Logo */}
          <div className="hero-content mb-8">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
              style={{
                background: "linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)",
                boxShadow: "0 0 32px rgba(37,99,235,0.35), 0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              <Image
                src="/logo.png"
                alt="KRedex Logo"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Badge */}
          <div className="hero-content mb-6">
            <span
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full border"
              style={{
                color: "#60a5fa",
                borderColor: "rgba(37,99,235,0.35)",
                background: "rgba(37,99,235,0.08)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-blue-400"
                style={{ boxShadow: "0 0 6px #60a5fa" }}
              />
              Early Access — Limited Spots
            </span>
          </div>

          {/* Headline */}
          <h1
            className="hero-content-delay text-3xl sm:text-4xl font-bold leading-tight tracking-tight mb-4"
            style={{ color: "#ffffff" }}
          >
            Secure P2P Lending &amp; Borrowing,{" "}
            <span
              style={{
                background: "linear-gradient(90deg,#3b82f6,#60a5fa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Built on KRedex.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="hero-content-delay text-sm sm:text-base leading-relaxed mb-10"
            style={{ color: "#71717a", maxWidth: "340px" }}
          >
            KRedex is launching soon. Stay tuned for something exciting! Be the first to access decentralized P2P lending.
          </p>

          {/* ── Form / Success ── */}
          {status === "success" ? (
            <div className="success-anim w-full flex flex-col items-center gap-4 py-6">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: "rgba(16,185,129,0.12)", boxShadow: "0 0 24px rgba(16,185,129,0.3)" }}
              >
                <CheckCircle2 className="w-7 h-7" style={{ color: "#10b981" }} />
              </div>
              <h3 className="text-xl font-semibold text-white">You&apos;re on the list!</h3>
              <p className="text-sm" style={{ color: "#71717a" }}>
                We&apos;ll notify you the moment we go live.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-4 text-xs underline underline-offset-2 transition-colors"
                style={{ color: "#52525b" }}
              >
                Join with another account
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="hero-content-delay-2 w-full flex flex-col gap-3"
            >
              {/* Full name */}
              <div className="relative">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: "#52525b" }}
                />
                <input
                  type="text"
                  required
                  placeholder="Full name"
                  value={fullName}
                  disabled={status === "loading"}
                  onChange={(e) => setFullName(e.target.value)}
                  className="wl-input w-full rounded-xl py-4 pl-11 pr-4 text-sm text-white placeholder-zinc-600 transition-all disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                />
              </div>

              {/* Email */}
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                  style={{ color: "#52525b" }}
                />
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={email}
                  disabled={status === "loading"}
                  onChange={(e) => setEmail(e.target.value)}
                  className="wl-input w-full rounded-xl py-4 pl-11 pr-4 text-sm text-white placeholder-zinc-600 transition-all disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={status === "loading"}
                className="wl-btn w-full rounded-xl py-4 flex items-center justify-center gap-2 font-semibold text-sm text-white transition-all duration-200 disabled:opacity-60 disabled:cursor-wait mt-1"
                style={{
                  background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)",
                  boxShadow: "0 0 20px rgba(37,99,235,0.4)",
                }}
              >
                {status === "loading" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Join the Waitlist
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {status === "error" && (
                <p
                  className="text-xs text-center px-4 py-2.5 rounded-lg border"
                  style={{
                    color: "#f87171",
                    background: "rgba(239,68,68,0.08)",
                    borderColor: "rgba(239,68,68,0.2)",
                  }}
                >
                  {errorMessage}
                </p>
              )}
            </form>
          )}

          {/* Trust badges */}
          <div className="mt-8 flex items-center gap-3" style={{ color: "#3f3f46" }}>
            <span className="text-xs">🔒 No spam</span>
            <span className="text-xs">•</span>
            <span className="text-xs">✦ Early-access perks</span>
            <span className="text-xs">•</span>
            <span className="text-xs">⚡ Launch alert</span>
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          className="relative mt-10 w-full flex flex-wrap items-center justify-center gap-x-3 gap-y-2 z-10 px-4 text-[15px] sm:text-base font-medium"
          style={{ color: "#a1a1aa" }}
        >
          <span>Follow us for updates:</span>
          <a
            href="https://x.com/kredexweb3"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-white bg-blue-500/10 border border-blue-400/30 px-4 py-2 rounded-full hover:bg-blue-500/20 hover:border-blue-400/50 transition-all shadow-[0_0_20px_rgba(59,130,246,0.15)]"
          >
            <span className="font-bold text-lg leading-none mt-[-2px]">𝕏</span>
            @kredexweb3
          </a>
        </div>
      </div>
    </>
  )
}
