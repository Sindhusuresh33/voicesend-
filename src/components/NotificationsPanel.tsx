import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
}

export default function NotificationsPanel({ onClose }: Props) {
  const notifications = useQuery(api.notifications.getNotifications) ?? [];
  const markAllRead = useMutation(api.notifications.markAllRead);

  const handleMarkAllRead = async () => {
    try {
      await markAllRead();
    } catch {
      toast.error("Failed to mark as read");
    }
  };

  const typeIcons: Record<string, string> = {
    connection: "📱",
    security: "🔐",
    security_alert: "🚨",
    reminder: "📅",
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-white font-semibold text-sm">Notifications</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleMarkAllRead}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-2">🔔</div>
            <p className="text-gray-500 text-sm">No notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n._id}
              className={`px-4 py-3 border-b border-gray-800 last:border-0 ${
                !n.isRead ? "bg-gray-800/50" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{typeIcons[n.type] ?? "🔔"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-xs font-semibold truncate">{n.title}</p>
                    {!n.isRead && (
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0"></span>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-gray-600 text-xs mt-1">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
