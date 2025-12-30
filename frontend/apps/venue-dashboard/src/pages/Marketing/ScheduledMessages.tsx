import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, List, Clock, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const scheduledMessages = [
  { id: 1, title: "July Newsletter", type: "announcement", audience: "All Subscribers", audienceCount: 8542, scheduled: "Jul 1, 2025 9:00 AM" },
  { id: 2, title: "Summer Festival - Week Before", type: "automated", audience: "Summer Festival Attendees", audienceCount: 1432, scheduled: "Jul 8, 2025 10:00 AM" },
  { id: 3, title: "Tech Conference Early Bird Ending", type: "announcement", audience: "All Subscribers", audienceCount: 8542, scheduled: "Jul 10, 2025 8:00 AM" },
  { id: 4, title: "Comedy Night - 24hr Reminder", type: "automated", audience: "Comedy Night Ticket Holders", audienceCount: 312, scheduled: "Jul 14, 2025 6:00 PM" },
  { id: 5, title: "Summer Festival - Day Before", type: "automated", audience: "Summer Festival Attendees", audienceCount: 1432, scheduled: "Jul 14, 2025 10:00 AM" },
  { id: 6, title: "Jazz Night - 48hr Reminder", type: "automated", audience: "Jazz Night Ticket Holders", audienceCount: 245, scheduled: "Jul 18, 2025 7:30 PM" },
];

const typeFilters = [
  { value: "all", label: "All Types" },
  { value: "announcement", label: "Announcements" },
  { value: "automated", label: "Automated" },
  { value: "event", label: "Event Messages" },
];

function getTypeBadge(type: string) {
  switch (type) {
    case "announcement": return "bg-purple-100 text-purple-700";
    case "automated": return "bg-green-100 text-green-700";
    case "event": return "bg-blue-100 text-blue-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function ScheduledMessages() {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<typeof scheduledMessages[0] | null>(null);

  const filteredMessages = scheduledMessages.filter(msg => {
    if (typeFilter !== "all" && msg.type !== typeFilter) return false;
    return true;
  });

  const handleCancel = () => {
    toast.success("Scheduled message cancelled");
    setShowCancelModal(false);
  };

  const getDropdownItems = (message: typeof scheduledMessages[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Cancel", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setSelectedMessage(message); setShowCancelModal(true); } },
  ];

  // Group messages by date for calendar view
  const messagesByDate = scheduledMessages.reduce((acc, msg) => {
    const date = msg.scheduled.split(" ")[0] + " " + msg.scheduled.split(" ")[1] + " " + msg.scheduled.split(" ")[2];
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, typeof scheduledMessages>);

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/marketing" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Scheduled Messages</h1>
            <p className="text-gray-500">{scheduledMessages.length} messages scheduled</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "list" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === "calendar" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </button>
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {typeFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {/* List View */}
      {viewMode === "list" && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Audience</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled For</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredMessages.map((message) => (
                <tr key={message.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{message.title}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(message.type)}`}>
                      {message.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{message.audience}</p>
                    <p className="text-xs text-gray-500">{message.audienceCount.toLocaleString()} recipients</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-sm text-gray-900">
                      <Clock className="w-4 h-4 text-yellow-500" />
                      {message.scheduled}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(message)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div className="space-y-4">
          {Object.entries(messagesByDate).map(([date, messages]) => (
            <div key={date} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">{date}</h3>
              </div>
              <div className="divide-y divide-gray-200">
                {messages.map((message) => (
                  <div key={message.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500 w-20">
                        {message.scheduled.split(" ").slice(3).join(" ")}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{message.title}</p>
                        <p className="text-sm text-gray-500">{message.audience}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(message.type)}`}>
                        {message.type}
                      </span>
                      <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(message)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredMessages.length === 0 && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Scheduled Messages</h3>
          <p className="text-gray-500">You don't have any messages scheduled.</p>
        </div>
      )}

      {/* Cancel Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Scheduled Message"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to cancel <strong>{selectedMessage?.title}</strong>? This message will not be sent.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Keep Scheduled</Button>
          <Button variant="danger" onClick={handleCancel}>Cancel Message</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
