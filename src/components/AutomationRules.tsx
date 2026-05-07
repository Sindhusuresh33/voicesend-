import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ta", label: "Tamil" },
  { code: "hi", label: "Hindi" },
  { code: "ml", label: "Malayalam" },
  { code: "tanglish", label: "Tanglish" },
];

export default function AutomationRules() {
  const rules = useQuery(api.automation.getRules) ?? [];
  const createRule = useMutation(api.automation.createRule);
  const toggleRule = useMutation(api.automation.toggleRule);
  const deleteRule = useMutation(api.automation.deleteRule);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !trigger.trim() || !response.trim()) {
      toast.error("Fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await createRule({ name, trigger, response, language });
      toast.success("Automation rule created!");
      setName(""); setTrigger(""); setResponse(""); setShowForm(false);
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Automation Rules</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 hover:bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {showForm ? "Cancel" : "+ New Rule"}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-green-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-white font-semibold text-sm">Create New Rule</h3>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name (e.g. Auto-reply busy)"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="Trigger keyword (e.g. 'busy', 'meeting')"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
          />
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Auto-response message"
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500 resize-none"
          />
          <div>
            <label className="text-gray-400 text-xs mb-1 block">Language</label>
            <div className="flex gap-2 flex-wrap">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    language === l.code ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? "Creating..." : "Create Rule"}
          </button>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-gray-400">No automation rules yet.</p>
          <p className="text-gray-600 text-sm mt-1">Create rules to auto-reply to messages.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule._id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.isActive ? "bg-green-400" : "bg-gray-500"}`}></span>
                    <h4 className="text-white font-semibold text-sm truncate">{rule.name}</h4>
                    <span className="text-gray-600 text-xs ml-auto flex-shrink-0">{rule.language}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-gray-400 text-xs">
                      <span className="text-gray-500">Trigger:</span> "{rule.trigger}"
                    </p>
                    <p className="text-gray-400 text-xs">
                      <span className="text-gray-500">Response:</span> "{rule.response}"
                    </p>
                    <p className="text-gray-600 text-xs">Triggered {rule.triggerCount} times</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleRule({ ruleId: rule._id })}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      rule.isActive
                        ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                        : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    }`}
                  >
                    {rule.isActive ? "Pause" : "Enable"}
                  </button>
                  <button
                    onClick={() => deleteRule({ ruleId: rule._id })}
                    className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    Del
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
