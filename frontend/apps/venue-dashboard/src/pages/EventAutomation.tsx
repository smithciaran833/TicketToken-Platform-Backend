import { useState } from "react";
import { ArrowLeft, Mail, Eye, Edit, Clock } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Toggle, Select, Modal, ModalFooter, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const tabs = [
  { name: "Overview", path: "" },
  { name: "Content", path: "/content" },
  { name: "Automation", path: "/automation" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

const timeOptions = [
  { value: "1", label: "1 day before" },
  { value: "2", label: "2 days before" },
  { value: "3", label: "3 days before" },
  { value: "7", label: "1 week before" },
  { value: "14", label: "2 weeks before" },
];

const dayOfOptions = [
  { value: "2", label: "2 hours before" },
  { value: "4", label: "4 hours before" },
  { value: "6", label: "6 hours before" },
  { value: "12", label: "12 hours before" },
  { value: "24", label: "24 hours before" },
];

const followUpOptions = [
  { value: "1", label: "1 day after" },
  { value: "2", label: "2 days after" },
  { value: "3", label: "3 days after" },
  { value: "7", label: "1 week after" },
];

export default function EventAutomation() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTiming, setReminderTiming] = useState("1");
  const [dayOfEnabled, setDayOfEnabled] = useState(true);
  const [dayOfTiming, setDayOfTiming] = useState("4");
  const [followUpEnabled, setFollowUpEnabled] = useState(true);
  const [followUpTiming, setFollowUpTiming] = useState("1");
  const [includeSurvey, setIncludeSurvey] = useState(true);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewType, setPreviewType] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Automation settings saved!");
  };

  const openPreview = (type: string) => {
    setPreviewType(type);
    setShowPreviewModal(true);
  };

  const getPreviewContent = () => {
    switch (previewType) {
      case "confirmation":
        return {
          subject: "Your tickets for Summer Music Festival",
          body: "Thanks for your purchase! Your tickets are attached below. We can't wait to see you there!"
        };
      case "reminder":
        return {
          subject: "Reminder: Summer Music Festival is coming up!",
          body: "Just a friendly reminder that Summer Music Festival is happening in 1 day. Here's what you need to know..."
        };
      case "dayof":
        return {
          subject: "Today's the day! Summer Music Festival",
          body: "The event starts in 4 hours. Here's everything you need for a great experience..."
        };
      case "followup":
        return {
          subject: "Thanks for attending Summer Music Festival!",
          body: "We hope you had an amazing time! We'd love to hear your feedback..."
        };
      default:
        return { subject: "", body: "" };
    }
  };

  const preview = getPreviewContent();

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Automated emails</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Automation"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {/* Order Confirmation - Always On */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Mail className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Order Confirmation</h3>
                <p className="text-sm text-gray-500 mt-1">Sent immediately after purchase</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                    Always On
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => openPreview("confirmation")}>
                <Eye className="w-4 h-4" />
                <span>Preview</span>
              </Button>
              <Button variant="ghost" size="sm">
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Event Reminder */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${reminderEnabled ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <Clock className={`w-5 h-5 ${reminderEnabled ? 'text-purple-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Event Reminder</h3>
                <p className="text-sm text-gray-500 mt-1">Remind attendees about the upcoming event</p>
                {reminderEnabled && (
                  <div className="mt-3">
                    <Select
                      options={timeOptions}
                      value={reminderTiming}
                      onChange={(e) => setReminderTiming(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openPreview("reminder")}>
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              <Toggle enabled={reminderEnabled} onChange={setReminderEnabled} />
            </div>
          </div>
        </div>

        {/* Day-Of Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${dayOfEnabled ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <Clock className={`w-5 h-5 ${dayOfEnabled ? 'text-purple-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Day-Of Information</h3>
                <p className="text-sm text-gray-500 mt-1">Send important day-of details (parking, entry, etc.)</p>
                {dayOfEnabled && (
                  <div className="mt-3">
                    <Select
                      options={dayOfOptions}
                      value={dayOfTiming}
                      onChange={(e) => setDayOfTiming(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openPreview("dayof")}>
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              <Toggle enabled={dayOfEnabled} onChange={setDayOfEnabled} />
            </div>
          </div>
        </div>

        {/* Post-Event Follow-Up */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${followUpEnabled ? 'bg-purple-100' : 'bg-gray-100'}`}>
                <Mail className={`w-5 h-5 ${followUpEnabled ? 'text-purple-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Post-Event Follow-Up</h3>
                <p className="text-sm text-gray-500 mt-1">Thank attendees and request feedback</p>
                {followUpEnabled && (
                  <div className="mt-3 space-y-3">
                    <Select
                      options={followUpOptions}
                      value={followUpTiming}
                      onChange={(e) => setFollowUpTiming(e.target.value)}
                    />
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={includeSurvey}
                        onChange={(e) => setIncludeSurvey(e.target.checked)}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">Include feedback survey</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => openPreview("followup")}>
                  <Eye className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm">
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
              <Toggle enabled={followUpEnabled} onChange={setFollowUpEnabled} />
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Email Preview"
        size="lg"
      >
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
            <p className="text-sm text-gray-500">Subject</p>
            <p className="font-medium text-gray-900">{preview.subject}</p>
          </div>
          <div className="p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">TT</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Summer Music Festival</h2>
              <p className="text-gray-500">August 15, 2025 • 6:00 PM</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-gray-700">{preview.body}</p>
            </div>
            <div className="text-center">
              <div className="inline-block bg-purple-600 text-white px-6 py-2 rounded-lg">
                View Tickets
              </div>
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowPreviewModal(false)}>Close</Button>
          <Button>Edit Template</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
