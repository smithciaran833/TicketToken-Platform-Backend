import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Bell, Volume2, Check } from "lucide-react";
import { Button, Toggle, useToast, ToastContainer } from "../../components/ui";

const activeAlerts = [
  { id: 1, zone: "Main Floor", capacity: 92, level: "warning", time: "5 min ago", acknowledged: false },
];

const alertHistory = [
  { id: 1, zone: "Main Floor", capacity: 95, level: "critical", time: "Yesterday 10:45 PM", resolved: "Auto-resolved when capacity dropped" },
  { id: 2, zone: "VIP Section", capacity: 82, level: "warning", time: "Yesterday 9:30 PM", resolved: "Acknowledged by John" },
  { id: 3, zone: "Bar Area", capacity: 98, level: "critical", time: "Dec 27, 8:15 PM", resolved: "Staff redirected guests" },
];

export default function CapacityAlerts() {
  const toast = useToast();
  
  const [settings, setSettings] = useState({
    warningThreshold: 80,
    criticalThreshold: 95,
    soundEnabled: true,
    pushEnabled: true,
  });

  const handleSaveSettings = () => {
    toast.success("Alert settings saved!");
  };

  const handleAcknowledge = (_alertId: number) => {
    toast.success("Alert acknowledged");
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/scanning/zones" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Capacity Alerts</h1>
          <p className="text-gray-500">Configure thresholds and manage alerts</p>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h2 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Active Alerts ({activeAlerts.length})
          </h2>
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="bg-white rounded-lg p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{alert.zone}</p>
                  <p className="text-sm text-gray-600">
                    Currently at <span className="font-semibold text-yellow-600">{alert.capacity}%</span> capacity
                  </p>
                  <p className="text-xs text-gray-500">{alert.time}</p>
                </div>
                <Button variant="secondary" onClick={() => handleAcknowledge(alert.id)}>
                  <Check className="w-4 h-4" />
                  Acknowledge
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Alert Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert Thresholds</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Warning Threshold
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="50"
                  max="95"
                  value={settings.warningThreshold}
                  onChange={(e) => setSettings({ ...settings, warningThreshold: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-16 text-center font-medium text-yellow-600 bg-yellow-100 px-3 py-1 rounded">
                  {settings.warningThreshold}%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Alert when zone reaches this capacity</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Critical Threshold
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="80"
                  max="100"
                  value={settings.criticalThreshold}
                  onChange={(e) => setSettings({ ...settings, criticalThreshold: parseInt(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-16 text-center font-medium text-red-600 bg-red-100 px-3 py-1 rounded">
                  {settings.criticalThreshold}%
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Urgent alert at this capacity</p>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Sound Alerts</p>
                    <p className="text-sm text-gray-500">Play sound when threshold reached</p>
                  </div>
                </div>
                <Toggle
                  enabled={settings.soundEnabled}
                  onChange={(val) => setSettings({ ...settings, soundEnabled: val })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900">Push Notifications</p>
                    <p className="text-sm text-gray-500">Send alerts to mobile devices</p>
                  </div>
                </div>
                <Toggle
                  enabled={settings.pushEnabled}
                  onChange={(val) => setSettings({ ...settings, pushEnabled: val })}
                />
              </div>
            </div>

            <Button onClick={handleSaveSettings} className="w-full">Save Settings</Button>
          </div>
        </div>

        {/* Alert History */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert History</h2>
          <div className="space-y-4">
            {alertHistory.map((alert) => (
              <div key={alert.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-medium text-gray-900">{alert.zone}</p>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                    alert.level === "critical" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {alert.capacity}%
                  </span>
                </div>
                <p className="text-sm text-gray-500">{alert.time}</p>
                <p className="text-sm text-green-600 mt-1">✓ {alert.resolved}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
