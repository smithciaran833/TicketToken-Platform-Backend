import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Send, Bell, AlertTriangle, Users, Calendar, Clock } from "lucide-react";
import { Button, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const recipientOptions = [
  { value: "all", label: "All Staff" },
  { value: "on-duty", label: "On Duty Today" },
  { value: "managers", label: "Managers Only" },
  { value: "security", label: "Security Team" },
  { value: "event", label: "Event Staff (Select Event)" },
];

const recentAnnouncements = [
  { id: 1, message: "Team meeting at 3pm in the break room before tonight's event.", sentTo: "All Staff", priority: "normal", time: "2 hours ago", readCount: 5, totalCount: 6 },
  { id: 2, message: "URGENT: Main entrance gate is stuck. Use VIP entrance until fixed.", sentTo: "On Duty", priority: "urgent", time: "4 hours ago", readCount: 4, totalCount: 4 },
  { id: 3, message: "New scanning procedures are now in effect. Please review the updated guidelines.", sentTo: "Security Team", priority: "normal", time: "Yesterday", readCount: 2, totalCount: 2 },
  { id: 4, message: "Reminder: Timesheets due by end of day Friday.", sentTo: "All Staff", priority: "normal", time: "2 days ago", readCount: 6, totalCount: 6 },
];

export default function StaffAnnouncements() {
  const toast = useToast();
  const [form, setForm] = useState({
    message: "",
    recipient: "all",
    priority: "normal",
  });

  const handleSend = () => {
    if (!form.message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    toast.success("Announcement sent!");
    setForm({ message: "", recipient: "all", priority: "normal" });
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Staff Announcements</h1>
          <p className="text-gray-500">Send messages to your team</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* New Announcement */}
        <div className="col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Announcement</h2>
            
            <div className="space-y-4">
              <Textarea
                label="Message"
                placeholder="Type your announcement..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={4}
              />

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Send To"
                  options={recipientOptions}
                  value={form.recipient}
                  onChange={(e) => setForm({ ...form, recipient: e.target.value })}
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setForm({ ...form, priority: "normal" })}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        form.priority === "normal" 
                          ? "bg-gray-900 text-white" 
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      Normal
                    </button>
                    <button
                      onClick={() => setForm({ ...form, priority: "urgent" })}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        form.priority === "urgent" 
                          ? "bg-red-600 text-white" 
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      Urgent
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSend}>
                  <Send className="w-4 h-4" />
                  Send Announcement
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Staff</p>
                <p className="text-xl font-bold text-gray-900">6</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">On Duty Today</p>
                <p className="text-xl font-bold text-gray-900">4</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Announcements */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Announcements</h2>
        <div className="space-y-3">
          {recentAnnouncements.map((announcement) => (
            <div key={announcement.id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    announcement.priority === "urgent" ? "bg-red-100" : "bg-gray-100"
                  }`}>
                    {announcement.priority === "urgent" ? (
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                    ) : (
                      <Bell className="w-4 h-4 text-gray-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-gray-900">{announcement.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
                      <span>To: {announcement.sentTo}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {announcement.time}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {announcement.readCount}/{announcement.totalCount} read
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
