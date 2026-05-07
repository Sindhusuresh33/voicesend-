import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

export default function AnalyticsDashboard() {
  const [days, setDays] = useState(7);
  const stats = useQuery(api.analytics.getMessageStats, { days });
  const dashboard = useQuery(api.analytics.getDashboardStats);
  const recordStats = useMutation(api.analytics.recordMessageStats);

  const handleAddSampleData = async () => {
    try {
      await recordStats({ sent: Math.floor(Math.random() * 20) + 5, received: Math.floor(Math.random() * 30) + 10, automated: Math.floor(Math.random() * 10) + 2, voiceTriggered: Math.floor(Math.random() * 5) });
      toast.success("Sample data added");
    } catch {
      toast.error("Failed to add data");
    }
  };

  const chartData = (stats ?? []).map((s) => ({
    date: new Date(s.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
    Sent: s.sent,
    Received: s.received,
    Automated: s.automated,
    Voice: s.voiceTriggered,
  }));

  const summaryCards = [
    { label: "Total Sent", value: dashboard?.totalSent ?? 0, icon: "📤", color: "text-blue-400" },
    { label: "Total Received", value: dashboard?.totalReceived ?? 0, icon: "📥", color: "text-green-400" },
    { label: "Automated", value: dashboard?.totalAutomated ?? 0, icon: "⚡", color: "text-yellow-400" },
    { label: "Voice Commands", value: dashboard?.totalVoice ?? 0, icon: "🎙️", color: "text-purple-400" },
    { label: "Reminders", value: dashboard?.totalReminders ?? 0, icon: "📅", color: "text-orange-400" },
    { label: "Trusted Devices", value: dashboard?.trustedDevices ?? 0, icon: "🔐", color: "text-red-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Analytics</h2>
        <button
          onClick={handleAddSampleData}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-lg transition-colors"
        >
          + Add Sample Data
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <div className="text-2xl mb-1">{card.icon}</div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
            <div className="text-gray-500 text-xs">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Time Range Selector */}
      <div className="flex gap-2">
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              days === d ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      {chartData.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-400">No data yet. Click "+ Add Sample Data" to see charts.</p>
        </div>
      ) : (
        <>
          {/* Messages Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-4 text-sm">Message Activity</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                  labelStyle={{ color: "#f9fafb" }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="Sent" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Received" fill="#22c55e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Automated" fill="#eab308" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Voice Commands Chart */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-4 text-sm">Voice Command Usage</h3>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }}
                  labelStyle={{ color: "#f9fafb" }}
                />
                <Line type="monotone" dataKey="Voice" stroke="#a855f7" strokeWidth={2} dot={{ fill: "#a855f7" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Voice Success Rate */}
      {dashboard && dashboard.totalVoice > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-3 text-sm">Voice Command Success Rate</h3>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-800 rounded-full h-3">
              <div
                className="bg-green-500 h-3 rounded-full transition-all"
                style={{ width: `${(dashboard.successfulVoice / dashboard.totalVoice) * 100}%` }}
              ></div>
            </div>
            <span className="text-green-400 font-bold text-sm">
              {Math.round((dashboard.successfulVoice / dashboard.totalVoice) * 100)}%
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-1">
            {dashboard.successfulVoice} / {dashboard.totalVoice} commands successful
          </p>
        </div>
      )}
    </div>
  );
}
