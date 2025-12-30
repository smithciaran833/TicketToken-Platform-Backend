import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, MessageSquare } from "lucide-react";
import { Button, Toggle, useToast, ToastContainer } from "../../components/ui";

export default function SubscribeUpdates() {
  const navigate = useNavigate();
  const toast = useToast();

  const [preferences, setPreferences] = useState({
    email: true,
    sms: false,
    productUpdates: true,
    maintenanceAlerts: true,
    statusChanges: true,
    newFeatures: true,
    tips: false,
    newsletter: false,
  });

  const handleSave = () => {
    toast.success("Preferences saved!");
    setTimeout(() => navigate("/venue/support"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notification Preferences</h1>
          <p className="text-gray-500">Choose how you want to receive updates</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Channels */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Notification Channels</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Email</p>
                  <p className="text-sm text-gray-500">john@venue.com</p>
                </div>
              </div>
              <Toggle
                enabled={preferences.email}
                onChange={(val) => setPreferences({ ...preferences, email: val })}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">SMS</p>
                  <p className="text-sm text-gray-500">+1 (555) 123-4567</p>
                </div>
              </div>
              <Toggle
                enabled={preferences.sms}
                onChange={(val) => setPreferences({ ...preferences, sms: val })}
              />
            </div>
          </div>
        </div>

        {/* Update Types */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">What would you like to receive?</h2>
          <div className="space-y-4">
            {[
              { key: "productUpdates", title: "Product Updates", description: "New features and improvements" },
              { key: "maintenanceAlerts", title: "Maintenance Alerts", description: "Scheduled downtime notifications" },
              { key: "statusChanges", title: "Status Changes", description: "Service outages and recovery" },
              { key: "newFeatures", title: "New Feature Announcements", description: "Major new capabilities" },
              { key: "tips", title: "Tips & Best Practices", description: "Helpful guides and suggestions" },
              { key: "newsletter", title: "Monthly Newsletter", description: "Platform news and customer stories" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <Toggle
                  enabled={preferences[item.key as keyof typeof preferences] as boolean}
                  onChange={(val) => setPreferences({ ...preferences, [item.key]: val })}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Quick Settings */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPreferences({
              ...preferences,
              productUpdates: true,
              maintenanceAlerts: true,
              statusChanges: true,
              newFeatures: true,
              tips: true,
              newsletter: true,
            })}
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            Subscribe to all
          </button>
          <button
            onClick={() => setPreferences({
              ...preferences,
              productUpdates: false,
              maintenanceAlerts: false,
              statusChanges: false,
              newFeatures: false,
              tips: false,
              newsletter: false,
            })}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Unsubscribe from all
          </button>
        </div>

        {/* Save */}
        <Button onClick={handleSave} className="w-full">Save Preferences</Button>
      </div>
    </div>
  );
}
