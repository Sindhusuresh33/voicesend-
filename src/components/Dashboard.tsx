import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignOutButton } from "../SignOutButton";
import WhatsAppConnect from "./WhatsAppConnect";
import VoiceCommands from "./VoiceCommands";
import SecuritySettings from "./SecuritySettings";
import NotificationsPanel from "./NotificationsPanel";
import ContactsPanel from "./ContactsPanel";

type Tab = "connect" | "voice" | "contacts" | "security";

interface Props {
  deviceId: string;
}

export default function Dashboard({ deviceId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("connect");
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = useQuery(api.notifications.getUnreadCount) ?? 0;
  const user = useQuery(api.auth.loggedInUser);
  const session = useQuery(api.whatsapp.getSession);

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "connect", icon: "📱", label: "Connect" },
    { id: "voice", icon: "🎙️", label: "Voice" },
    { id: "contacts", icon: "👥", label: "Contacts" },
    { id: "security", icon: "🔐", label: "Security" },
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/20">
            <span className="text-lg">🛡️</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-none">AutoGuard Chat</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${session?.status === "connected" ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}></div>
              <span className="text-xs text-gray-400">
                {session?.status === "connected" ? `${session.displayName}` : "Not connected"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative w-9 h-9 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center justify-center transition-colors"
          >
            <span className="text-lg">🔔</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center">
            <span className="text-sm font-bold text-green-400">
              {user?.email?.[0]?.toUpperCase() ?? "U"}
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      {/* Notifications Dropdown */}
      {showNotifications && (
        <div className="fixed top-16 right-4 z-30 w-80">
          <NotificationsPanel onClose={() => setShowNotifications(false)} />
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-4">
          {activeTab === "connect" && <WhatsAppConnect />}
          {activeTab === "voice" && <VoiceCommands />}
          {activeTab === "contacts" && <ContactsPanel />}
          {activeTab === "security" && <SecuritySettings deviceId={deviceId} />}
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-gray-900 border-t border-gray-800 px-2 py-2 sticky bottom-0 z-20">
        <div className="flex justify-around max-w-5xl mx-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all ${
                activeTab === tab.id
                  ? "bg-green-500/20 text-green-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}