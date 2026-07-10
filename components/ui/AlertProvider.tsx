"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldCheck, Info, X } from "lucide-react";

type AlertType = "error" | "success" | "info";

interface AlertData {
  id: string;
  title: string;
  message: string;
  type: AlertType;
  duration: number;
}

interface AlertContextProps {
  showAlert: (title: string, message: string, type?: AlertType, duration?: number) => void;
  hideAlert: (id: string) => void;
}

const AlertContext = createContext<AlertContextProps | undefined>(undefined);

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlert must be used within an AlertProvider");
  return context;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hideAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const showAlert = useCallback(
    (title: string, message: string, type: AlertType = "info", duration = 5000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setAlerts((prev) => [...prev, { id, title, message, type, duration }]);
      if (duration > 0) setTimeout(() => hideAlert(id), duration);
    },
    [hideAlert]
  );

  const iconMap = {
    error: <AlertTriangle size={22} />,
    success: <ShieldCheck size={22} />,
    info: <Info size={22} />,
  };

  const colorMap = {
    error: {
      border: "rgba(239,68,68,0.35)",
      icon: "#ef4444",
      iconBg: "rgba(239,68,68,0.12)",
      bar: "#ef4444",
    },
    success: {
      border: "rgba(34,197,94,0.35)",
      icon: "#22c55e",
      iconBg: "rgba(34,197,94,0.12)",
      bar: "#22c55e",
    },
    info: {
      border: "rgba(96,165,250,0.35)",
      icon: "#60a5fa",
      iconBg: "rgba(96,165,250,0.12)",
      bar: "#60a5fa",
    },
  };

  const alertContainer =
    mounted
      ? createPortal(
          <div
            style={{
              position: "fixed",
              top: "24px",
              right: "24px",
              zIndex: 99999,
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              width: "360px",
              maxWidth: "calc(100vw - 48px)",
              pointerEvents: "none",
            }}
          >
            <AnimatePresence initial={false}>
              {alerts.map((alert) => {
                const c = colorMap[alert.type];
                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: 60, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 60, scale: 0.9 }}
                    transition={{ type: "spring", damping: 22, stiffness: 280 }}
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: "16px",
                      border: `1px solid ${c.border}`,
                      background:
                        "linear-gradient(145deg, rgba(20,20,30,0.92), rgba(10,10,20,0.97))",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      boxShadow:
                        "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
                      padding: "16px",
                      pointerEvents: "auto",
                    }}
                  >
                    {/* Content */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      {/* Icon */}
                      <div
                        style={{
                          flexShrink: 0,
                          width: "38px",
                          height: "38px",
                          borderRadius: "10px",
                          background: c.iconBg,
                          color: c.icon,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {iconMap[alert.type]}
                      </div>

                      {/* Text */}
                      <div style={{ flex: 1, minWidth: 0, paddingTop: "1px" }}>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 700,
                            fontSize: "0.9rem",
                            color: "#ffffff",
                            lineHeight: 1.3,
                            marginBottom: "4px",
                          }}
                        >
                          {alert.title}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.82rem",
                            color: "rgba(200,200,220,0.85)",
                            lineHeight: 1.5,
                          }}
                        >
                          {alert.message}
                        </p>
                      </div>

                      {/* Close */}
                      <button
                        onClick={() => hideAlert(alert.id)}
                        style={{
                          flexShrink: 0,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          color: "rgba(180,180,200,0.6)",
                          padding: "2px",
                          lineHeight: 1,
                          transition: "color 0.15s",
                        }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.color = "#ffffff")
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLButtonElement).style.color =
                            "rgba(180,180,200,0.6)")
                        }
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Progress bar */}
                    <motion.div
                      initial={{ scaleX: 1 }}
                      animate={{ scaleX: 0 }}
                      transition={{ duration: alert.duration / 1000, ease: "linear" }}
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: "3px",
                        transformOrigin: "left",
                        background: c.bar,
                        opacity: 0.7,
                      }}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body
        )
      : null;

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert }}>
      {children}
      {alertContainer}
    </AlertContext.Provider>
  );
}
