import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Bell, Smartphone } from "lucide-react";
import { Button, Toggle, useToast, ToastContainer } from "../../components/ui";

export default function NotificationPreferences() {
  const navigate = useNavigate();
  const toast = useToast();

  const [preferences, setPreferences] = useState({
    emailTicketSales: true,
    emailDailySummary: true,
    emailWeeklyReport: false,
    emailMarketing: false,
    pushTicketSales: true,
    pushLowInventory: true,
    pushEventReminders: true,
    pushTeamActivity: false,
    smsUrgentAlerts: true,
    smsEventDay: true,
  });

  const handleSave = () => {
    toast.success("Notification preferences saved!");
    setTimeout(() => navigate("/account/settings"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/account/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notification Preferences</h1>
          <p className="text-gray-500">Choose how you want to be notified</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Email Notifications */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Email Notifications</h2>
              <p className="text-sm text-gray-500">Sent to john@venue.com</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Ticket Sales</p>
                <p className="text-sm text-gray-500">Get notified when tickets are sold</p>
              </div>
              <Toggle
                enabled={preferences.emailTicketSales}
                onChange={(val) => setPreferences({ ...preferences, emailTicketSales: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Daily Summary</p>
                <p className="text-sm text-gray-500">Daily recap of sales and activity</p>
              </div>
              <Toggle
                enabled={preferences.emailDailySummary}
                onChange={(val) => setPreferences({ ...preferences, emailDailySummary: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Weekly Report</p>
                <p className="text-sm text-gray-500">Comprehensive weekly analytics</p>
              </div>
              <Toggle
                enabled={preferences.emailWeeklyReport}
                onChange={(val) => setPreferences({ ...preferences, emailWeeklyReport: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Marketing & Tips</p>
                <p className="text-sm text-gray-500">Product updates and best practices</p>
              </div>
              <Toggle
                enabled={preferences.emailMarketing}
                onChange={(val) => setPreferences({ ...preferences, emailMarketing: val })}
              />
            </div>
          </div>
        </div>

        {/* Push Notifications */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Push Notifications</h2>
              <p className="text-sm text-gray-500">Browser and mobile app notifications</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Ticket Sales</p>
                <p className="text-sm text-gray-500">Real-time sale notifications</p>
              </div>
              <Toggle
                enabled={preferences.pushTicketSales}
                onChange={(val) => setPreferences({ ...preferences, pushTicketSales: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Low Inventory Alerts</p>
                <p className="text-sm text-gray-500">When ticket types are running low</p>
              </div>
              <Toggle
                enabled={preferences.pushLowInventory}
                onChange={(val) => setPreferences({ ...preferences, pushLowInventory: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Event Reminders</p>
                <p className="text-sm text-gray-500">Reminders before your events</p>
              </div>
              <Toggle
                enabled={preferences.pushEventReminders}
                onChange={(val) => setPreferences({ ...preferences, pushEventReminders: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Team Activity</p>
                <p className="text-sm text-gray-500">When team members make changes</p>
              </div>
              <Toggle
                enabled={preferences.pushTeamActivity}
                onChange={(val) => setPreferences({ ...preferences, pushTeamActivity: val })}
              />
            </div>
          </div>
        </div>

        {/* SMS Notifications */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">SMS Notifications</h2>
              <p className="text-sm text-gray-500">Text messages to +1 (555) 123-4567</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Urgent Alerts</p>
                <p className="text-sm text-gray-500">Critical issues requiring immediate attention</p>
              </div>
              <Toggle
                enabled={preferences.smsUrgentAlerts}
                onChange={(val) => setPreferences({ ...preferences, smsUrgentAlerts: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Event Day Alerts</p>
                <p className="text-sm text-gray-500">Important updates on event days</p>
              </div>
              <Toggle
                enabled={preferences.smsEventDay}
                onChange={(val) => setPreferences({ ...preferences, smsEventDay: val })}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave}>Save Preferences</Button>
          <Link to="/account/settings">
            <Button variant="secondary">Cancel</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
