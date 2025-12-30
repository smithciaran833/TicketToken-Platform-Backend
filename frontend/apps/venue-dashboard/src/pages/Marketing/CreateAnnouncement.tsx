import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Clock, Save, Eye } from "lucide-react";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const audienceOptions = [
  { value: "all", label: "All Subscribers" },
  { value: "event", label: "Event Attendees" },
  { value: "ticket", label: "Specific Ticket Holders" },
  { value: "segment", label: "Custom Segment" },
];

const events = [
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
  { value: "6", label: "Comedy Night" },
];

const segments = [
  { value: "vip", label: "VIP Customers" },
  { value: "repeat", label: "Repeat Attendees" },
  { value: "inactive", label: "Inactive (90+ days)" },
];

export default function CreateAnnouncement() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    subject: "",
    audienceType: "all",
    event: "",
    segment: "",
    content: "",
    sendOption: "now",
    scheduleDate: "",
    scheduleTime: "",
  });

  const [showPreview, setShowPreview] = useState(false);

  const getAudienceCount = () => {
    switch (form.audienceType) {
      case "all": return 8542;
      case "event": return form.event ? 1432 : 0;
      case "ticket": return 856;
      case "segment": return form.segment ? 2150 : 0;
      default: return 0;
    }
  };

  const handleSend = () => {
    if (!form.subject.trim()) {
      toast.error("Please enter a subject line");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Please enter message content");
      return;
    }

    if (form.sendOption === "now") {
      toast.success("Announcement sent successfully!");
    } else {
      toast.success("Announcement scheduled!");
    }
    setTimeout(() => navigate("/venue/marketing/announcements"), 1500);
  };

  const handleSaveDraft = () => {
    toast.success("Draft saved!");
    navigate("/venue/marketing/announcements");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/marketing/announcements" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Announcement</h1>
            <p className="text-gray-500">Send a message to your audience</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button variant="secondary" onClick={handleSaveDraft}>
            <Save className="w-4 h-4" />
            Save Draft
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="col-span-2 space-y-6">
          {/* Subject */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <Input
              label="Subject Line"
              placeholder="Enter a compelling subject line..."
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>

          {/* Audience */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Audience</h2>
            <div className="space-y-4">
              <Select
                label="Send To"
                options={audienceOptions}
                value={form.audienceType}
                onChange={(e) => setForm({ ...form, audienceType: e.target.value, event: "", segment: "" })}
              />

              {form.audienceType === "event" && (
                <Select
                  label="Select Event"
                  options={[{ value: "", label: "Choose an event..." }, ...events]}
                  value={form.event}
                  onChange={(e) => setForm({ ...form, event: e.target.value })}
                />
              )}

              {form.audienceType === "segment" && (
                <Select
                  label="Select Segment"
                  options={[{ value: "", label: "Choose a segment..." }, ...segments]}
                  value={form.segment}
                  onChange={(e) => setForm({ ...form, segment: e.target.value })}
                />
              )}

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-800">
                  <strong>{getAudienceCount().toLocaleString()}</strong> recipients will receive this message
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Message Content</h2>
            {!showPreview ? (
              <Textarea
                label=""
                placeholder="Write your announcement here..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={12}
              />
            ) : (
              <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 min-h-[300px]">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{form.subject || "Your Subject Line"}</h3>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {form.content || "Your message content will appear here..."}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Send Options */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Options</h2>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendOption"
                  value="now"
                  checked={form.sendOption === "now"}
                  onChange={(e) => setForm({ ...form, sendOption: e.target.value })}
                  className="text-purple-600"
                />
                <div>
                  <p className="font-medium text-gray-900">Send Now</p>
                  <p className="text-sm text-gray-500">Deliver immediately</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="sendOption"
                  value="schedule"
                  checked={form.sendOption === "schedule"}
                  onChange={(e) => setForm({ ...form, sendOption: e.target.value })}
                  className="text-purple-600"
                />
                <div>
                  <p className="font-medium text-gray-900">Schedule</p>
                  <p className="text-sm text-gray-500">Send at a specific time</p>
                </div>
              </label>

              {form.sendOption === "schedule" && (
                <div className="pt-3 space-y-3">
                  <Input
                    label="Date"
                    type="date"
                    value={form.scheduleDate}
                    onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })}
                  />
                  <Input
                    label="Time"
                    type="time"
                    value={form.scheduleTime}
                    onChange={(e) => setForm({ ...form, scheduleTime: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Send Button */}
          <Button className="w-full" onClick={handleSend}>
            {form.sendOption === "now" ? (
              <>
                <Send className="w-4 h-4" />
                Send Announcement
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                Schedule Announcement
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
