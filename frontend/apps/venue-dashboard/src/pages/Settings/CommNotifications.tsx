import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Button, Input, Toggle, useToast, ToastContainer } from "../../components/ui";

const notifications = [
  {
    id: "order-confirm",
    name: "Order Confirmation",
    description: "Sent immediately after purchase",
    email: true,
    sms: false,
    push: true,
    alwaysOn: true,
  },
  {
    id: "ticket-delivery",
    name: "Ticket Delivery",
    description: "Digital tickets sent to customer",
    email: true,
    sms: false,
    push: true,
    alwaysOn: true,
  },
  {
    id: "event-reminder",
    name: "Event Reminder",
    description: "Reminder before the event",
    email: true,
    sms: true,
    push: true,
    alwaysOn: false,
  },
  {
    id: "event-update",
    name: "Event Updates",
    description: "Changes to event details",
    email: true,
    sms: true,
    push: true,
    alwaysOn: false,
  },
  {
    id: "post-event",
    name: "Post-Event Follow-up",
    description: "Survey and feedback request",
    email: true,
    sms: false,
    push: false,
    alwaysOn: false,
  },
];

export default function CommNotifications() {
  const toast = useToast();

  const [settings, setSettings] = useState(notifications);
  const [timing, setTiming] = useState({
    reminderDays: "1",
    followupDays: "1",
  });

  const toggleChannel = (id: string, channel: "email" | "sms" | "push") => {
    setSettings(settings.map(s => 
      s.id === id ? { ...s, [channel]: !s[channel] } : s
    ));
  };

  const handleSave = () => {
    toast.success("Notification settings saved!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Notification Settings</h1>
            <p className="text-gray-500">Configure customer notifications</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Timing Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Timing</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Event Reminder
            </label>
            <div className="flex items-center gap-2">
              <Input
                label=""
                type="number"
                min="1"
                max="7"
                value={timing.reminderDays}
                onChange={(e) => setTiming({ ...timing, reminderDays: e.target.value })}
                className="w-20"
              />
              <span className="text-gray-600">days before event</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Post-Event Follow-up
            </label>
            <div className="flex items-center gap-2">
              <Input
                label=""
                type="number"
                min="1"
                max="7"
                value={timing.followupDays}
                onChange={(e) => setTiming({ ...timing, followupDays: e.target.value })}
                className="w-20"
              />
              <span className="text-gray-600">days after event</span>
            </div>
          </div>
        </div>
      </div>

      {/* Channel Legend */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          <span>Email</span>
        </div>
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          <span>SMS</span>
        </div>
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4" />
          <span>Push (App)</span>
        </div>
      </div>

      {/* Notifications Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notification</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Mail className="w-4 h-4 mx-auto" />
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <MessageSquare className="w-4 h-4 mx-auto" />
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                <Smartphone className="w-4 h-4 mx-auto" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {settings.map((notification) => (
              <tr key={notification.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="font-medium text-gray-900">{notification.name}</p>
                      <p className="text-sm text-gray-500">{notification.description}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  {notification.alwaysOn ? (
                    <span className="text-green-600 text-sm">Always on</span>
                  ) : (
                    <Toggle
                      enabled={notification.email}
                      onChange={() => toggleChannel(notification.id, "email")}
                    />
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  {notification.alwaysOn ? (
                    <span className="text-gray-400 text-sm">—</span>
                  ) : (
                    <Toggle
                      enabled={notification.sms}
                      onChange={() => toggleChannel(notification.id, "sms")}
                    />
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  {notification.alwaysOn ? (
                    <span className="text-green-600 text-sm">Always on</span>
                  ) : (
                    <Toggle
                      enabled={notification.push}
                      onChange={() => toggleChannel(notification.id, "push")}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Order confirmation and ticket delivery emails are always sent and cannot be disabled.
      </p>
    </div>
  );
}
