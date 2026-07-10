"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAlert } from "@/components/ui/AlertProvider";
import { updateUserProfile } from "@/app/actions/update-profile";
import { uploadKYCDocument } from "@/app/actions/kyc-upload";

interface ProfileSettingsFormProps {
  initialName?: string;
  initialPhone?: string;
  initialDob?: string;
  kycStatus?: string;
  hasGovId?: boolean;
  emailConfirmed?: boolean;
}

export function ProfileSettingsForm({
  initialName = "",
  initialPhone = "",
  initialDob = "",
  kycStatus = "pending",
  hasGovId = false,
  emailConfirmed = false,
}: ProfileSettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [formData, setFormData] = useState({
    full_name: initialName,
    phone: initialPhone,
    date_of_birth: initialDob,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;

    if (name === "government_id" && files?.[0]) {
      setSelectedFile(files[0]);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress(null);

    try {
      // Step 1: Update profile fields via server action with the signed-in session.
      const result = await updateUserProfile({
        full_name: formData.full_name,
        phone: formData.phone,
        date_of_birth: formData.date_of_birth || undefined,
      });

      if (!result.success) {
        throw new Error(result.error ?? "Failed to update profile.");
      }

      // Step 2: Upload government ID if selected
      if (selectedFile) {
        setUploadProgress(30);

        const formDataWithFile = new FormData();
        formDataWithFile.append("government_id", selectedFile);

        const uploadResult = await uploadKYCDocument(formDataWithFile);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error ?? "Failed to upload document.");
        }

        setUploadProgress(100);
      }

      setSuccess(true);
      setUploadProgress(null);
      // Refresh server-rendered data after a short delay
      setTimeout(() => router.refresh(), 600);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setUploadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const docLocked = hasGovId && kycStatus !== "pending";
  const { showAlert } = useAlert();

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      const { getBrowserSupabaseClient } = await import("@/lib/supabase/client");
      const supabase = getBrowserSupabaseClient();
      if (supabase) {
        await supabase.auth.signOut();
      }
      showAlert("Farewell!", "Successfully signed out. See you next time.", "success", 3000);
      
      // Delay to let the user see the alert
      setTimeout(() => {
        window.location.href = "/api/auth/signout";
      }, 1500);
    } catch (err) {
      console.error("Logout failed:", err);
      setSigningOut(false);
    }
  };

  return (
    <form className="settings-form-group" onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "0.6rem",
            background: "rgba(220,38,38,0.06)",
            border: "1px solid rgba(220,38,38,0.25)",
            color: "#dc2626",
            fontSize: "0.875rem",
            marginBottom: "0.25rem",
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "0.85rem 1rem",
            borderRadius: "0.6rem",
            background: "rgba(34,207,157,0.08)",
            border: "1px solid rgba(34,207,157,0.3)",
            color: "#16a07a",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          ✓ Profile details saved successfully.
          {selectedFile ? " Document submitted for admin review." : ""}
        </div>
      )}

      {/* Email Verification Section */}
      <div className="settings-field settings-field--full" style={{ marginBottom: "2rem", padding: "1.5rem", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 0.25rem" }}>Email Verification</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
              {emailConfirmed ? "Your email is securely linked and verified." : "Link your Google account to verify your email."}
            </p>
          </div>
          {emailConfirmed ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#22cf9d", fontSize: "0.875rem", fontWeight: 600, padding: "0.5rem 1rem", background: "rgba(34,207,157,0.1)", borderRadius: "999px" }}>
              ✓ Verified
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { window.location.href = "/api/auth/google"; }}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.6rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border-strong)",
                background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          )}
        </div>
      </div>

      {/* Legal Identity Fields */}
      <div className="settings-grid">
        <div className="settings-field settings-field--full">
          <label htmlFor="full_name" className="settings-label">
            Full Legal Name
            <span style={{ color: "#ff6b6b", marginLeft: "0.2rem" }}>*</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            className="settings-input"
            value={formData.full_name}
            onChange={handleChange}
            placeholder="As it appears on your government ID"
            required
            autoComplete="name"
          />
          <p className="settings-help-text" style={{ marginTop: "0.25rem" }}>
            Must match your government-issued identification exactly.
          </p>
        </div>

        <div className="settings-field">
          <label htmlFor="phone" className="settings-label">
            Phone Number
            <span style={{ color: "#ff6b6b", marginLeft: "0.2rem" }}>*</span>
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="settings-input"
            value={formData.phone}
            onChange={handleChange}
            placeholder="+91 98765 43210"
            required
            autoComplete="tel"
          />
          <p className="settings-help-text" style={{ marginTop: "0.25rem", color: "#8b5cf6" }}>
            OTP Verification coming soon.
          </p>
        </div>

        <div className="settings-field">
          <label htmlFor="date_of_birth" className="settings-label">
            Date of Birth
            <span style={{ color: "#ff6b6b", marginLeft: "0.2rem" }}>*</span>
          </label>
          <input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            className="settings-input"
            value={formData.date_of_birth}
            onChange={handleChange}
            max={
              new Date(Date.now() - 18 * 365.25 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0]
            }
            required
          />
          <p className="settings-help-text" style={{ marginTop: "0.25rem" }}>
            Must be 18+ (Required).
          </p>
        </div>
      </div>

      {/* Government ID Upload */}
      <fieldset className="settings-upload-panel" disabled={docLocked}>
        <legend className="settings-label settings-upload-legend">
          Government ID Verification
          {docLocked && (
            <span
              style={{
                marginLeft: "0.6rem",
                fontSize: "0.72rem",
                background: "rgba(34,207,157,0.1)",
                color: "#16a07a",
                padding: "0.15rem 0.5rem",
                borderRadius: "0.3rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              SUBMITTED
            </span>
          )}
        </legend>

        {docLocked ? (
          <p className="settings-help-text" style={{ color: "#16a07a", marginBottom: 0 }}>
            ✓ Your government ID has been submitted and is under admin review.
            Contact support if you need to update it.
          </p>
        ) : (
          <>
            <p className="settings-help-text">
              Upload an official government ID (passport, national ID, or
              driver&apos;s license). Stored securely and reviewed by admins only.
            </p>
            <p className="settings-disclaimer settings-disclaimer--rules">
              Accepted: JPG, PNG, WEBP, or PDF · Max size: 10 MB
            </p>
            <p className="settings-disclaimer settings-disclaimer--warning">
              Important: once submitted, this document cannot be changed from your dashboard.
            </p>
            <input
              type="file"
              name="government_id"
              id="government_id"
              className="settings-input settings-input--file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleChange}
            />
            {selectedFile && (
              <p className="settings-file-note">
                Selected: {selectedFile.name} (
                {(selectedFile.size / 1024).toFixed(0)} KB)
              </p>
            )}
            {uploadProgress !== null && (
              <div
                className="settings-progress-track"
                style={{ marginTop: "0.75rem" }}
              >
                <div
                  className="settings-progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </>
        )}
      </fieldset>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
        }}
      >
        <button
          type="submit"
          disabled={loading}
          className="workspace-button workspace-button--primary settings-submit-btn"
        >
          {loading ? "Saving…" : "Save & Verify Identity"}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="workspace-button workspace-button--secondary settings-submit-btn"
          style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.3)" }}
        >
          {signingOut ? "Signing out…" : "Sign Out"}
        </button>
      </div>
    </form>
  );
}
