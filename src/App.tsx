import { Authenticated, Unauthenticated, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import { useState } from "react";
import { toast } from "sonner";
import Dashboard from "./components/Dashboard";
import DeviceVerification from "./components/DeviceVerification";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Unauthenticated>
        <LandingPage />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-950 via-green-950 to-gray-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-14 h-14 bg-green-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/30">
              <span className="text-3xl">🛡️</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">AutoGuard Chat</h1>
          <p className="text-green-400 text-lg font-medium">WhatsApp Automation & Security</p>
          <p className="text-gray-400 mt-2 text-sm">
            Voice commands • Multi-language • Smart reminders • Trusted device security
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <SignInForm />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: "🎙️", label: "Voice Commands" },
            { icon: "🔐", label: "PIN Security" },
            { icon: "📊", label: "Analytics" },
          ].map((f) => (
            <div key={f.label} className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-xs text-gray-400">{f.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Forced PIN Setup Screen — shown on very first login ───────────────────────
function ForcedPINSetup({ onComplete }: { onComplete: () => void }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const setupPIN = useMutation(api.security.setupPIN);

  const handleSetup = async () => {
    if (pin.length < 4) {
      toast.error("PIN must be at least 4 digits");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PINs do not match");
      return;
    }
    setLoading(true);
    try {
      await setupPIN({ pin });
      toast.success("PIN set! Your account is now secure.");
      onComplete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to set PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-green-950/20 to-gray-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Set Security PIN</h2>
          <p className="text-gray-400 mt-2 text-sm">
            Create a PIN to secure your account. You'll need this to login from any new device.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 h-1 bg-green-500 rounded-full"></div>
            <div className="flex-1 h-1 bg-green-500 rounded-full"></div>
            <div className="flex-1 h-1 bg-gray-700 rounded-full"></div>
          </div>
          <p className="text-gray-500 text-xs text-center">Step 2 of 3 — Secure your account</p>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Enter PIN (4-8 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest focus:outline-none focus:border-green-500 transition-colors"
              maxLength={8}
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              placeholder="••••"
              className={`w-full bg-gray-800 border rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest focus:outline-none transition-colors ${
                confirmPin && pin !== confirmPin
                  ? "border-red-500 focus:border-red-500"
                  : "border-gray-700 focus:border-green-500"
              }`}
              maxLength={8}
            />
            {confirmPin && pin !== confirmPin && (
              <p className="text-red-400 text-xs mt-1 text-center">PINs do not match</p>
            )}
            {confirmPin && pin === confirmPin && pin.length >= 4 && (
              <p className="text-green-400 text-xs mt-1 text-center">✓ PINs match</p>
            )}
          </div>

          <button
            onClick={handleSetup}
            disabled={loading || pin.length < 4 || pin !== confirmPin}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? "Setting PIN..." : "Set PIN & Continue →"}
          </button>

          <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-3">
            <p className="text-blue-400 text-xs text-center">
              🔒 This PIN will be required when you login from a new device.
              Keep it safe — you cannot recover it.
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const [deviceId] = useState(() => {
    let id = localStorage.getItem("autoguard_device_id");
    if (!id) {
      id = `device_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
      localStorage.setItem("autoguard_device_id", id);
    }
    return id;
  });

  const deviceTrust = useQuery(api.security.checkDeviceTrust, { deviceId });

  // ✅ KEY FIX: verifiedThisSession starts false every time
  // No useEffect auto-setting it from deviceTrust.trusted
  // User MUST enter PIN every new browser session — even on trusted devices
  const [verifiedThisSession, setVerifiedThisSession] = useState(false);
  const [pinSetupDone, setPinSetupDone] = useState(false);

  // Loading state — wait for Convex
  if (deviceTrust === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500"></div>
      </div>
    );
  }

  // ── STEP 1: No PIN set → show forced PIN setup ─────────────────────────────
  if (!deviceTrust.hasPIN && !pinSetupDone) {
    return (
      <ForcedPINSetup
        onComplete={() => {
          setPinSetupDone(true);
          setVerifiedThisSession(true);
        }}
      />
    );
  }

  // ── STEP 2: PIN exists but not verified this session → ask PIN ─────────────
  // Runs every session — even for previously trusted devices
  if (deviceTrust.hasPIN && !verifiedThisSession) {
    return (
      <DeviceVerification
        deviceId={deviceId}
        onVerified={() => setVerifiedThisSession(true)}
      />
    );
  }

  // ── STEP 3: PIN verified this session → enter app ──────────────────────────
  return <Dashboard deviceId={deviceId} />;
}