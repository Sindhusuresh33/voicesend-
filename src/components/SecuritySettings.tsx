import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

interface Props {
  deviceId: string;
}

export default function SecuritySettings({ deviceId }: Props) {
  const removeTrustedDevice = useMutation(api.security.removeTrustedDevice);
  const trustedDevices = useQuery(api.security.getTrustedDevices) ?? [];
  const loginAttempts = useQuery(api.security.getLoginAttempts) ?? [];

  const handleRemoveDevice = async (id: string) => {
    if (!confirm("Remove this trusted device?")) return;
    try {
      await removeTrustedDevice({ deviceId: id as Parameters<typeof removeTrustedDevice>[0]["deviceId"] });
      toast.success("Device removed");
    } catch {
      toast.error("Failed to remove device");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-white">Security Settings</h2>

      {/* Trusted Devices */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span>📱</span> Trusted Devices
          <span className="ml-auto text-gray-500 text-xs font-normal">{trustedDevices.length} device(s)</span>
        </h3>
        {trustedDevices.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No trusted devices yet</p>
        ) : (
          <div className="space-y-2">
            {trustedDevices.map((device) => (
              <div key={device._id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                <span className="text-xl">{device.deviceType === "mobile" ? "📱" : "💻"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{device.deviceName}</p>
                  <p className="text-gray-500 text-xs">
                    Last seen: {new Date(device.lastSeen).toLocaleDateString()}
                    {device.deviceId === deviceId && (
                      <span className="ml-2 text-green-400">(current)</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${device.isTrusted ? "bg-green-400" : "bg-gray-500"}`}></span>
                  {device.deviceId !== deviceId && (
                    <button
                      onClick={() => handleRemoveDevice(device._id)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Login Attempts */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
          <span>📋</span> Recent Login Attempts
        </h3>
        {loginAttempts.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">No login attempts recorded</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {loginAttempts.map((attempt) => (
              <div key={attempt._id} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${attempt.success ? "bg-green-400" : "bg-red-400"}`}></span>
                <span className={attempt.success ? "text-green-400" : "text-red-400"}>
                  {attempt.success ? "Success" : "Failed"}
                </span>
                <span className="text-gray-500 text-xs ml-auto">
                  {new Date(attempt.attemptedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}