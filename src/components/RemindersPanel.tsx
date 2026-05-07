import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { useState } from "react";

export default function RemindersPanel() {
  const reminders = useQuery(api.reminders.getReminders) ?? [];
  const markNotified = useMutation(api.reminders.markReminderNotified);
  const deleteReminder = useMutation(api.reminders.deleteReminder);
  const analyzeMessage = useAction(api.reminders.analyzeMessageForReminder);
  const [testMsg, setTestMsg] = useState("");
  const [testSender, setTestSender] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    if (!testMsg.trim() || !testSender.trim()) {
      toast.error("Enter a message and sender name");
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeMessage({ message: testMsg, senderName: testSender });
      if (result.hasReminder) {
        toast.success(`Reminder detected: "${result.reminderText}"`);
      } else {
        toast.info("No reminder detected in this message");
      }
      setTestMsg("");
      setTestSender("");
    } catch {
      toast.error("Failed to analyze message");
    } finally {
      setAnalyzing(false);
    }
  };

  const pending = reminders.filter((r) => !r.isNotified);
  const done = reminders.filter((r) => r.isNotified);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Reminders</h2>

      {/* Test Reminder Detection */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
          <span>🤖</span> Test AI Reminder Detection
        </h3>
        <div className="space-y-2">
          <input
            value={testSender}
            onChange={(e) => setTestSender(e.target.value)}
            placeholder="Sender name (e.g. Priya)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <textarea
            value={testMsg}
            onChange={(e) => setTestMsg(e.target.value)}
            placeholder="Paste a message to analyze (e.g. 'Don't forget our meeting tomorrow at 3pm')"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
          />
          <button
            onClick={handleAnalyze}
            disabled={analyzing || !testMsg.trim() || !testSender.trim()}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            {analyzing ? "Analyzing..." : "Analyze for Reminders"}
          </button>
        </div>
      </div>

      {/* Pending Reminders */}
      {pending.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
            <span>⏰</span> Pending ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r._id} className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{r.reminderText}</p>
                    <p className="text-gray-400 text-xs mt-1">From: {r.senderName}</p>
                    {r.scheduledTime && (
                      <p className="text-yellow-400 text-xs mt-0.5">
                        📅 {new Date(r.scheduledTime).toLocaleString()}
                      </p>
                    )}
                    <p className="text-gray-600 text-xs mt-1 truncate">"{r.sourceMessage}"</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => markNotified({ reminderId: r._id })}
                      className="text-green-400 hover:text-green-300 text-xs px-2 py-1 bg-green-500/10 rounded transition-colors"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => deleteReminder({ reminderId: r._id })}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-500/10 rounded transition-colors"
                    >
                      Del
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Reminders */}
      {done.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
            <span>✅</span> Completed ({done.length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {done.map((r) => (
              <div key={r._id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                <span className="text-green-400 text-sm">✓</span>
                <div className="flex-1 min-w-0">
                  <p className="text-gray-400 text-sm line-through truncate">{r.reminderText}</p>
                  <p className="text-gray-600 text-xs">From: {r.senderName}</p>
                </div>
                <button
                  onClick={() => deleteReminder({ reminderId: r._id })}
                  className="text-red-400 hover:text-red-300 text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {reminders.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-400">No reminders yet.</p>
          <p className="text-gray-600 text-sm mt-1">Use the AI analyzer above to detect reminders from messages.</p>
        </div>
      )}
    </div>
  );
}
