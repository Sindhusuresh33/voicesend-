import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignOutButton } from "../SignOutButton";

interface Props {
  deviceId: string;
  onVerified: () => void;
}

function parseConvexError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Verification failed";
  const match = raw.match(/Uncaught Error:\s*(.+?)(?:\s+at handler|\s+Called by|$)/s);
  if (match) return match[1].trim();
  return raw;
}

export default function DeviceVerification({ deviceId, onVerified }: Props) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const verifyPIN = useMutation(api.security.verifyPIN);

  const deviceName = navigator.userAgent.includes("Mobile") ? "Mobile Browser" : "Desktop Browser";
  const deviceType = navigator.userAgent.includes("Mobile") ? "mobile" : "desktop";

  const handleVerify = async () => {
    if (pin.length < 4) {
      setErrorMsg("PIN must be at least 4 digits");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      await verifyPIN({ pin, deviceId, deviceName, deviceType });
      onVerified();
    } catch (err: unknown) {
      setErrorMsg(parseConvexError(err));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 via-red-950/20 to-gray-950 p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-orange-500/20 border-2 border-orange-500/50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🔐</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Security PIN Required</h2>
          <p className="text-gray-400 mt-2 text-sm">
            Enter your PIN to access your account.
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">

          {/* PIN Input */}
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Security PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 8));
                setErrorMsg("");
              }}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleVerify()}
              placeholder="Enter PIN"
              className={`w-full bg-gray-800 border rounded-xl px-4 py-3 text-white text-center text-2xl tracking-widest focus:outline-none transition-colors ${
                errorMsg ? "border-red-500 focus:border-red-400" : "border-gray-700 focus:border-green-500"
              }`}
              maxLength={8}
              disabled={loading}
              autoFocus
            />
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-3 text-center">
              <p className="text-red-400 text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {/* Verify button */}
          <button
            onClick={handleVerify}
            disabled={loading || pin.length < 4}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Verifying...
              </span>
            ) : (
              "Enter App →"
            )}
          </button>
        </div>

        <div className="mt-4 text-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}