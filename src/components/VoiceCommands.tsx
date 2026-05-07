import { useState, useRef } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

const BRIDGE_URL = "http://localhost:3001";

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ta", label: "Tamil", flag: "🇮🇳" },
  { code: "hi", label: "Hindi", flag: "🇮🇳" },
  { code: "ml", label: "Malayalam", flag: "🇮🇳" },
  { code: "tanglish", label: "Tanglish", flag: "🌐" },
];

const EXAMPLE_COMMANDS: Record<string, string[]> = {
  en: [
    "Send hello to Sindhu",
    "Message Mona that I am late for class",
    "Tell Rahul that I am sick today",
    "Chat Nithya that I am on my way",
    "Inform Mona that meeting is cancelled",
    "Send hi to Sindhu",
    "Set reminder for meeting tomorrow",
  ],
  ta: [
    "சிந்துக்கு ஹாய் அனுப்பு",
    "மோனாக்கு நான் லேட் ஆகிறேன் சொல்லு",
    "ராகுல் கிட்ட நான் sick சொல்லு",
    "சிந்து கிட்ட என்ன பண்ற கேளு",
    "நாளை meeting reminder வை",
  ],
  hi: [
    "Sindhu ko hello bhejo",
    "Mona ko bolo main late hoon",
    "Rahul ko bol main bimar hoon",
    "Sindhu ko message karo main aa raha hoon",
    "Kal meeting reminder lagao",
  ],
  ml: [
    "സിന്ധുക്ക് ഹായ് അയക്കൂ",
    "Sindhu ku hi അയക്കൂ",
    "Mona ku I am late പറയൂ",
    "Rahul ku hello അയക്കൂ",
    "Rahul chat തുറക്കൂ",
  ],
  tanglish: [
    "Sindhu ku hi anuppu",
    "Sindhu ku message send pannu hi nu",
    "Sindhu kku na class kku vara late aagum nnu solliru",
    "Sindhu kitta enna pandra nnu kelu",
    "na oorla iruken nnu Sindhu kita solliru",
    "Mona ku sollu naan late aagiren",
    "Rahul kita chat open pannu",
  ],
};

const VOICE_TIPS: Record<string, string> = {
  en: '"Send [msg] to [name]" or "Message [name] that [msg]"',
  ta: '"[பெயர்]க்கு [msg] அனுப்பு"',
  hi: '"[नाम] को [msg] भेजो"',
  ml: '"[name]ക്ക് [msg] അയക്കൂ"',
  tanglish: '"[name] ku [msg] anuppu" or "[name] kku [msg] nnu solliru"',
};

interface ParsedResult {
  action: string;
  contact: string;
  phone: string;
  message: string;
  response: string;
}

// ── Open WhatsApp DESKTOP app to a specific chat ─────────────────────────────
// Uses whatsapp:// URI protocol which opens the desktop app directly (not browser)
// phone: digits only e.g. "919489979969"
// message: pre-fill text (empty string = just open the chat)
function openWhatsAppDesktopChat(phone: string, message: string) {
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits || digits.length < 7) return;

  const encodedMsg = encodeURIComponent(message || "");
  // whatsapp:// opens the installed desktop app directly to that contact's chat
  const url = `whatsapp://send?phone=${digits}&text=${encodedMsg}`;
  window.location.href = url;
}

export default function VoiceCommands() {
  const [selectedLang, setSelectedLang] = useState("en");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const transcriptRef = useRef("");
  const [result, setResult] = useState<ParsedResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const processCommand = useAction(api.voice.processVoiceCommand);
  const history = useQuery(api.voice.getVoiceHistory) ?? [];
  const session = useQuery(api.whatsapp.getSession);
  const isWAConnected = session?.status === "connected";

  // ── Full auto send: bridge sends + opens WhatsApp desktop to that chat ─────
  const sendViaWhatsApp = async (parsed: ParsedResult) => {
    if (parsed.action !== "send_message") return;
    if (!parsed.message) {
      toast.error("No message text detected. Please say the message clearly.");
      return;
    }

    const phoneOrName = parsed.phone || parsed.contact;
    setSending(true);
    setLastSent(null);

    try {
      if (!isWAConnected) {
        toast.error("WhatsApp not connected. Go to Connect tab and scan QR first.");
        return;
      }

      // Step 1: Send message via bridge (silent, background send)
      let sentPhone = parsed.phone; // may be empty if no phone saved in app contacts
      let sentOk = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(`${BRIDGE_URL}/send-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: phoneOrName,
            message: parsed.message,
            contactName: parsed.contact,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            sentOk = true;
            setLastSent(parsed.contact);
            toast.success(`✅ "${parsed.message}" sent to ${parsed.contact}!`);

            // Bridge returns the resolved phone number in sentTo field
            // e.g. "919489979969@c.us" → extract digits
            if (data.sentTo) {
              sentPhone = data.sentTo.replace("@c.us", "").replace(/\D/g, "");
            }
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          toast.error(`Send failed: ${errData.error || "Unknown error"}`);
          console.warn("[Bridge] Error:", errData.error);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") {
          toast.error("Bridge timed out. Make sure 'node server/whatsapp-server.js' is running.");
        } else {
          toast.error("Bridge unreachable. Make sure the bridge server is running.");
        }
        console.warn("[Bridge] Error:", err?.message);
        return;
      }

      // Step 2: Open WhatsApp desktop app to that contact's chat
      // Do this AFTER sending so user can see the sent message in the chat
      if (sentPhone) {
        // Short delay so WhatsApp desktop gets the sent message before opening
        setTimeout(() => {
          openWhatsAppDesktopChat(sentPhone, "");
        }, 800);
      } else if (!sentOk && parsed.phone) {
        // Send failed but we have a phone — open with pre-filled message
        openWhatsAppDesktopChat(parsed.phone, parsed.message);
      }

    } finally {
      setSending(false);
    }
  };

  // ── Voice recognition ─────────────────────────────────────────────────────
  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast.error("Speech recognition not supported. Use Chrome browser.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    const langMap: Record<string, string> = {
      en: "en-US",
      ta: "ta-IN",
      hi: "hi-IN",
      ml: "ml-IN",
      tanglish: "ta-IN",
    };

    recognition.lang = langMap[selectedLang] || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: any) => {
      const t = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setTranscript(t);
      transcriptRef.current = t;
    };

    recognition.onend = () => {
      setIsListening(false);
      if (transcriptRef.current) handleProcess(transcriptRef.current);
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      const errMsg = event.error || "unknown";
      if (errMsg === "no-speech") {
        toast.error("No speech detected. Try again or type below.");
      } else {
        toast.error("Voice error. Type your command below.");
      }
      if (transcriptRef.current) handleProcess(transcriptRef.current);
    };

    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const handleProcess = async (cmd: string) => {
    if (!cmd.trim()) return;
    setProcessing(true);
    setSending(false);
    setResult(null);
    setLastSent(null);

    try {
      const res = await processCommand({ command: cmd, language: selectedLang });
      const parsed = res as ParsedResult;
      setResult(parsed);

      if (parsed.action === "send_message") {
        await sendViaWhatsApp(parsed);
      }
    } catch {
      toast.error("Failed to process command. Check your internet connection.");
    } finally {
      setProcessing(false);
    }
  };

  const actionIcons: Record<string, string> = {
    send_message: "💬",
    open_chat: "📂",
    share_location: "📍",
    set_reminder: "⏰",
    block_contact: "🚫",
    unknown: "❓",
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-1">Voice Commands</h2>
        <p className="text-gray-400 text-sm">Speak in your language — sends automatically</p>
      </div>

      {/* Connection status banner */}
      {!isWAConnected ? (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-2">
          <span className="text-yellow-400">⚠️</span>
          <p className="text-yellow-300 text-xs">
            WhatsApp not connected — go to <strong>Connect tab</strong> and scan QR.
          </p>
        </div>
      ) : (
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-3 flex items-center gap-2">
          <span>✅</span>
          <p className="text-green-300 text-xs">
            Connected — voice commands send messages <strong>automatically</strong> and open WhatsApp desktop.
          </p>
        </div>
      )}

      {/* Language Selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
        <p className="text-gray-400 text-xs mb-2">Select Language</p>
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setSelectedLang(lang.code)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedLang === lang.code
                  ? "bg-green-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
        <p className="text-green-400 text-xs mt-2 font-medium">
          💬 {VOICE_TIPS[selectedLang]}
        </p>
      </div>

      {/* Voice Button */}
      <div className="flex flex-col items-center gap-4 py-4">
        <button
          onClick={isListening ? stopListening : startListening}
          disabled={processing || sending}
          className={`w-28 h-28 rounded-full flex items-center justify-center text-5xl transition-all shadow-2xl ${
            isListening
              ? "bg-red-500 shadow-red-500/40 scale-110 animate-pulse"
              : "bg-green-600 hover:bg-green-500 shadow-green-500/30 hover:scale-105"
          } disabled:opacity-50`}
        >
          {isListening ? "⏹️" : "🎙️"}
        </button>
        <p className="text-gray-400 text-sm">
          {isListening
            ? "Listening… tap to stop"
            : processing
            ? "Processing command…"
            : sending
            ? "Sending message…"
            : "Tap to speak"}
        </p>
        {transcript && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 max-w-xs text-center">
            <p className="text-white text-sm">"{transcript}"</p>
          </div>
        )}
      </div>

      {/* Manual Input */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-400 text-xs mb-2">Or type a command</p>
        <div className="flex gap-2">
          <input
            value={transcript}
            onChange={(e) => {
              setTranscript(e.target.value);
              transcriptRef.current = e.target.value;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && transcript && !processing && !sending) {
                handleProcess(transcript);
              }
            }}
            placeholder={`Type in ${LANGUAGES.find((l) => l.code === selectedLang)?.label}...`}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <button
            onClick={() => handleProcess(transcript)}
            disabled={!transcript || processing || sending}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            {processing || sending ? "..." : "Send"}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`border rounded-xl p-4 ${
            result.action === "send_message"
              ? lastSent
                ? "bg-green-900/30 border-green-400/40"
                : "bg-green-900/20 border-green-500/30"
              : "bg-gray-900 border-gray-700"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="text-3xl">{actionIcons[result.action] ?? "✅"}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-green-400 font-semibold text-sm capitalize">
                  {result.action.replace(/_/g, " ")}
                </span>
                {result.contact && (
                  <span className="bg-green-500/20 text-green-300 text-xs px-2 py-0.5 rounded-full">
                    {result.contact}
                  </span>
                )}
                {lastSent && (
                  <span className="bg-green-500/30 text-green-300 text-xs px-2 py-0.5 rounded-full font-semibold">
                    ✓ Sent!
                  </span>
                )}
              </div>
              <p className="text-white text-sm">{result.response}</p>
              {result.message && (
                <p className="text-gray-400 text-xs mt-1">Message: "{result.message}"</p>
              )}
              {result.action === "send_message" && result.message && !lastSent && (
                <button
                  onClick={() => sendViaWhatsApp(result)}
                  disabled={sending}
                  className="mt-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  {sending ? "Sending…" : "↺ Retry"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-3">
        <p className="text-blue-400 text-xs font-medium mb-1">💡 How it works</p>
        <div className="text-gray-400 text-xs space-y-1">
          <p>• <strong className="text-white">No need to add contacts</strong> — finds from your WhatsApp automatically</p>
          <p>• Message sends <strong className="text-white">automatically</strong> via bridge</p>
          <p>• WhatsApp desktop opens to show the sent message</p>
          <p>• Keep bridge running: <code className="text-green-400">node server/whatsapp-server.js</code></p>
        </div>
      </div>

      {/* Examples */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-gray-400 text-xs mb-2">
          Example commands — {LANGUAGES.find((l) => l.code === selectedLang)?.label}
        </p>
        <div className="space-y-1.5">
          {(EXAMPLE_COMMANDS[selectedLang] || EXAMPLE_COMMANDS.en).map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setTranscript(ex);
                transcriptRef.current = ex;
                handleProcess(ex);
              }}
              className="w-full text-left bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg transition-colors"
            >
              "{ex}"
            </button>
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-xs mb-3">Recent Commands</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {history.slice(0, 10).map((cmd) => (
              <div key={cmd._id} className="flex items-center gap-3 text-sm">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    cmd.status === "success" ? "bg-green-400" : "bg-red-400"
                  }`}
                />
                <span className="text-gray-300 flex-1 truncate">"{cmd.command}"</span>
                <span className="text-gray-500 text-xs">{cmd.language}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}