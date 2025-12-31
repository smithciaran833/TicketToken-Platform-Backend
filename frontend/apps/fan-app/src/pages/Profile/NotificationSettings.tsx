import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

const initialSettings: Record<string, NotificationSetting[]> = {
  channels: [
    { id: "push", label: "Push Notifications", description: "Receive notifications on your device", enabled: true },
    { id: "email", label: "Email Notifications", description: "Receive updates via email", enabled: true },
    { id: "sms", label: "SMS Notifications", description: "Receive text messages", enabled: false },
  ],
  types: [
    { id: "orders", label: "Order Confirmations", description: "When you purchase tickets", enabled: true },
    { id: "reminders", label: "Event Reminders", description: "Before events you're attending", enabled: true },
    { id: "price-drops", label: "Price Drops", description: "When saved events drop in price", enabled: true },
    { id: "new-events", label: "New Events", description: "From artists and venues you follow", enabled: true },
    { id: "resale", label: "Resale Updates", description: "When your listings sell or get views", enabled: true },
    { id: "marketing", label: "Marketing & Promotions", description: "Special offers and announcements", enabled: false },
  ],
};

export default function NotificationSettings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState(initialSettings);

  const toggleSetting = (category: string, id: string) => {
    setSettings((prev) => ({
      ...prev,
      [category]: prev[category].map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s
      ),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Channels */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Notification Channels
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {settings.channels.map((setting) => (
              <div
                key={setting.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="font-medium text-gray-900">{setting.label}</p>
                  <p className="text-sm text-gray-500">{setting.description}</p>
                </div>
                <button
                  onClick={() => toggleSetting("channels", setting.id)}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    setting.enabled ? "bg-purple-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      setting.enabled ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Types */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Notification Types
          </h2>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {settings.types.map((setting) => (
              <div
                key={setting.id}
                className="flex items-center justify-between px-5 py-4"
              >
                <div>
                  <p className="font-medium text-gray-900">{setting.label}</p>
                  <p className="text-sm text-gray-500">{setting.description}</p>
                </div>
                <button
                  onClick={() => toggleSetting("types", setting.id)}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    setting.enabled ? "bg-purple-600" : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      setting.enabled ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
