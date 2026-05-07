import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

// Bridge server running on your machine via: node server/whatsapp-server.js
const BRIDGE_URL = "http://localhost:3001";

export default function WhatsAppConnect() {
  const session = useQuery(api.whatsapp.getSession);
  const generateQR = useMutation(api.whatsapp.generateQRSession);
  const disconnectWA = useMutation(api.whatsapp.disconnectWhatsApp);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrExpiry, setQrExpiry] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrImageSrc, setQrImageSrc] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<"idle" | "waiting" | "ready" | "error">("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Watch Convex DB reactively — bridge pushes QR here via HTTP action ────
  const convexQR = useQuery(
    api.whatsapp.pollQRCode,
    sessionId ? { sessionId } : "skip"
  );

  // When Convex gets the QR from the bridge, display it
  useEffect(() => {
    if (!convexQR?.qrCode) return;
    if (convexQR.status === "connected") return;

    const qrString = convexQR.qrCode;

    // Bridge stores base64 PNG data URL — display directly
    if (qrString.startsWith("data:image")) {
      setQrImageSrc(qrString);
      setBridgeStatus("ready");
    }
  }, [convexQR?.qrCode, convexQR?.status]);

  // ── Also poll bridge directly every 2s as backup ──────────────────────────
  const startPolling = (expiry: number) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      if (Date.now() > expiry) {
        stopPolling();
        setBridgeStatus("error");
        toast.error("QR code expired. Please generate a new one.");
        setSessionId(null);
        return;
      }

      try {
        const res = await fetch(`${BRIDGE_URL}/qr`);
        if (res.ok) {
          const data = await res.json();
          if (data.qr) {
            setQrImageSrc(data.qr);
            setBridgeStatus("ready");
          }
          if (data.status === "connected") {
            stopPolling();
          }
        }
      } catch {
        // Bridge not yet ready — keep polling silently
      }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Stop when WhatsApp session becomes connected in Convex
  useEffect(() => {
    if (session?.status === "connected") {
      stopPolling();
      setSessionId(null);
      setQrImageSrc(null);
      setBridgeStatus("idle");
    }
  }, [session?.status]);

  useEffect(() => () => stopPolling(), []);

  // ── Expiry countdown display ──────────────────────────────────────────────
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!qrExpiry || session?.status === "connected") return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.round((qrExpiry - Date.now()) / 1000));
      setSecondsLeft(s);
      if (s === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [qrExpiry, session?.status]);

  // ── KEY FIX: Generate QR — Convex saves session, BROWSER calls bridge ─────
  const handleGenerateQR = async () => {
    setLoading(true);
    setBridgeStatus("waiting");
    setQrImageSrc(null);

    try {
      // Step 1: Save session in Convex DB (no fetch inside Convex mutation)
      const result = await generateQR();
      const sid = result.sessionId;
      const expiry = result.qrExpiry;
      setSessionId(sid);
      setQrExpiry(expiry);

      // Step 2: Browser calls bridge directly — this works because browser
      // can reach localhost:3001, but Convex cloud servers cannot
      const bridgeRes = await fetch(`${BRIDGE_URL}/start-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid }),
      });

      if (!bridgeRes.ok) {
        const errText = await bridgeRes.text();
        throw new Error(`Bridge responded with error: ${errText}`);
      }

      toast.success("WhatsApp starting — QR will appear in ~15 seconds…");

      // Step 3: Poll bridge for the QR image
      startPolling(expiry);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("fetch")) {
        toast.error(
          "❌ Cannot reach bridge server. Make sure it's running:\nnode server/whatsapp-server.js"
        );
      } else {
        toast.error(`Failed: ${msg}`);
      }
      setBridgeStatus("idle");
      setSessionId(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect WhatsApp? You'll need to scan QR again.")) return;
    try {
      // Convex updates DB status
      const result = await disconnectWA();
      // Browser tells bridge to stop the WA client
      if (result?.sessionId) {
        await fetch(`${BRIDGE_URL}/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: result.sessionId }),
        }).catch(() => {});
      }
      toast.success("WhatsApp disconnected");
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const handleCancel = () => {
    stopPolling();
    setSessionId(null);
    setQrImageSrc(null);
    setBridgeStatus("idle");
  };

  // ── CONNECTED VIEW ────────────────────────────────────────────────────────
  if (session?.status === "connected") {
    return (
      <div className="space-y-4">
        <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-3xl">
              📱
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-semibold">Connected</span>
              </div>
              <h3 className="text-white text-xl font-bold">{session.displayName}</h3>
              <p className="text-gray-400">{session.phoneNumber}</p>
              {session.connectedAt && (
                <p className="text-gray-500 text-xs mt-1">
                  Connected {new Date(session.connectedAt).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">✅</div>
            <div className="text-white font-semibold text-sm">Real WhatsApp</div>
            <div className="text-gray-500 text-xs">Web & Mobile</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <div className="text-2xl mb-1">🔄</div>
            <div className="text-white font-semibold text-sm">Auto-Sync</div>
            <div className="text-gray-500 text-xs">Contacts & Messages</div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3">Integration Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2 text-gray-400">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Works with WhatsApp Web & Mobile App</span>
            </div>
            <div className="flex items-start gap-2 text-gray-400">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Open source — anyone can deploy and use</span>
            </div>
            <div className="flex items-start gap-2 text-gray-400">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>Uses whatsapp-web.js for real integration</span>
            </div>
            <div className="flex items-start gap-2 text-gray-400">
              <span className="text-green-400 mt-0.5">✓</span>
              <span>No manual contact setup needed</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleDisconnect}
          className="w-full bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-400 font-semibold py-3 rounded-xl transition-colors"
        >
          Disconnect WhatsApp
        </button>
      </div>
    );
  }

  // ── QR / WAITING VIEW ─────────────────────────────────────────────────────
  if (sessionId) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Connect WhatsApp</h2>
          <p className="text-gray-400 text-sm">
            Scan the QR code with your WhatsApp app to connect
          </p>
        </div>

        <div className="bg-gray-900 border border-green-500/30 rounded-2xl p-6 flex flex-col items-center gap-4">
          {secondsLeft !== null && secondsLeft > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 text-sm font-medium">QR Code Active</span>
              <span className="text-gray-500 text-xs ml-2">
                Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
              </span>
            </div>
          )}

          {bridgeStatus === "ready" && qrImageSrc ? (
            <div className="bg-white p-3 rounded-xl shadow-lg">
              <img
                src={qrImageSrc}
                alt="WhatsApp QR Code — scan with your phone"
                width={220}
                height={220}
                className="block"
              />
            </div>
          ) : (
            <div className="w-56 h-56 bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-3 border border-gray-700">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500"></div>
              <p className="text-gray-400 text-sm text-center px-4 whitespace-pre-line">
                {bridgeStatus === "waiting"
                  ? "Starting WhatsApp…\nThis takes ~15 seconds"
                  : "Waiting for QR code…"}
              </p>
              {bridgeStatus === "waiting" && secondsLeft !== null && secondsLeft < 280 && !qrImageSrc && (
                <p className="text-yellow-400 text-xs text-center px-4">
                  ⚠️ Make sure bridge server is running:<br />
                  <code className="text-green-400">node server/whatsapp-server.js</code>
                </p>
              )}
            </div>
          )}

          <p className="text-gray-400 text-sm text-center">
            Open WhatsApp → Settings → Linked Devices → Link a Device
          </p>

          <div className="w-full bg-gray-800/50 rounded-xl p-3 text-xs text-gray-400 space-y-1">
            <p className="font-medium text-gray-300 mb-1">📱 How to scan:</p>
            <p>1. Open WhatsApp on your phone</p>
            <p>2. Tap ⋮ Menu → Linked Devices</p>
            <p>3. Tap <strong className="text-white">Link a Device</strong></p>
            <p>4. Point camera at the QR code above</p>
          </div>
        </div>

        <button
          onClick={handleCancel}
          className="w-full bg-gray-800 hover:bg-gray-700 text-gray-400 py-2 rounded-xl transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── DEFAULT VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Connect WhatsApp</h2>
        <p className="text-gray-400 text-sm">
          Scan the QR code with your WhatsApp app to connect
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex flex-col items-center gap-4">
            <div className="w-24 h-24 bg-gray-800 rounded-2xl flex items-center justify-center">
              <span className="text-5xl">📲</span>
            </div>
            <div className="text-center">
              <h3 className="text-white font-semibold mb-2">How to connect</h3>
              <ol className="text-gray-400 text-sm space-y-2 text-left">
                <li className="flex gap-2"><span className="text-green-400 font-bold">1.</span> Click "Generate QR Code" below</li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">2.</span> Open WhatsApp on your phone</li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">3.</span> Go to Settings → Linked Devices</li>
                <li className="flex gap-2"><span className="text-green-400 font-bold">4.</span> Tap "Link a Device" and scan</li>
              </ol>
            </div>
          </div>
        </div>

        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-yellow-400 text-xs font-medium mb-1">⚙️ Prerequisite: Bridge server must be running</p>
          <p className="text-gray-400 text-xs">
            Open a terminal in your project folder and run:<br />
            <code className="text-green-400 bg-gray-800 px-1 rounded mt-1 block">
              node server/whatsapp-server.js
            </code>
          </p>
        </div>

        <button
          onClick={handleGenerateQR}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-lg"
        >
          {loading ? "Starting…" : "🔲 Generate QR Code"}
        </button>
      </div>
    </div>
  );
}