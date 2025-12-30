import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Mail, MessageSquare } from "lucide-react";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const events = [
  { value: "", label: "Select an event..." },
  { value: "1", label: "Summer Music Festival (1,432 ticket holders)" },
  { value: "2", label: "Tech Conference (856 ticket holders)" },
  { value: "5", label: "Jazz Night (245 ticket holders)" },
  { value: "6", label: "Comedy Night (312 ticket holders)" },
];

const ticketTypesMap: Record<string, { value: string; label: string }[]> = {
  "1": [
    { value: "all", label: "All Ticket Types" },
    { value: "ga", label: "General Admission (1,000)" },
    { value: "vip", label: "VIP Access (200)" },
    { value: "early", label: "Early Bird (232)" },
  ],
  "2": [
    { value: "all", label: "All Ticket Types" },
    { value: "standard", label: "Standard Pass (500)" },
    { value: "premium", label: "Premium Pass (256)" },
    { value: "vip", label: "VIP Pass (100)" },
  ],
  "5": [
    { value: "all", label: "All Ticket Types" },
    { value: "ga", label: "General Admission (200)" },
    { value: "vip", label: "VIP Table (45)" },
  ],
  "6": [
    { value: "all", label: "All Ticket Types" },
    { value: "ga", label: "General Admission (312)" },
  ],
};

const audienceFilters = [
  { value: "all", label: "All Ticket Holders" },
  { value: "checked-in", label: "Checked In Only" },
  { value: "not-checked-in", label: "Not Checked In" },
];

export default function MessageTicketHolders() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    event: "",
    ticketType: "all",
    audienceFilter: "all",
    messageType: "email",
    subject: "",
    content: "",
  });

  const ticketTypes = form.event ? ticketTypesMap[form.event] || [] : [];

  const getAudienceCount = () => {
    if (!form.event) return 0;
    
    const baseCounts: Record<string, number> = {
      "1": 1432,
      "2": 856,
      "5": 245,
      "6": 312,
    };
    
    let count = baseCounts[form.event] || 0;
    
    if (form.audienceFilter === "checked-in") count = Math.floor(count * 0.7);
    if (form.audienceFilter === "not-checked-in") count = Math.floor(count * 0.3);
    
    return count;
  };

  const handleSend = () => {
    if (!form.event) {
      toast.error("Please select an event");
      return;
    }
    if (!form.subject.trim()) {
      toast.error("Please enter a subject line");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Please enter message content");
      return;
    }

    toast.success(`Message sent to ${getAudienceCount().toLocaleString()} ticket holders!`);
    setTimeout(() => navigate("/venue/marketing"), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/marketing" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Message Ticket Holders</h1>
          <p className="text-gray-500">Send a message to event attendees</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="col-span-2 space-y-6">
          {/* Event Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Event</h2>
            <Select
              label="Event"
              options={events}
              value={form.event}
              onChange={(e) => setForm({ ...form, event: e.target.value, ticketType: "all" })}
            />
          </div>

          {/* Audience */}
          {form.event && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Audience</h2>
              <div className="space-y-4">
                <Select
                  label="Ticket Type"
                  options={ticketTypes}
                  value={form.ticketType}
                  onChange={(e) => setForm({ ...form, ticketType: e.target.value })}
                />

                <Select
                  label="Filter"
                  options={audienceFilters}
                  value={form.audienceFilter}
                  onChange={(e) => setForm({ ...form, audienceFilter: e.target.value })}
                />

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <p className="text-sm text-purple-800">
                    <strong>{getAudienceCount().toLocaleString()}</strong> ticket holders will receive this message
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Message Type */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Message Type</h2>
            <div className="grid grid-cols-2 gap-3">
              <label 
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  form.messageType === "email" ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="messageType"
                  value="email"
                  checked={form.messageType === "email"}
                  onChange={(e) => setForm({ ...form, messageType: e.target.value })}
                  className="sr-only"
                />
                <Mail className={`w-5 h-5 ${form.messageType === "email" ? "text-purple-600" : "text-gray-400"}`} />
                <div>
                  <p className={`font-medium ${form.messageType === "email" ? "text-purple-700" : "text-gray-900"}`}>Email</p>
                  <p className="text-sm text-gray-500">Send via email</p>
                </div>
              </label>

              <label 
                className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                  form.messageType === "sms" ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="messageType"
                  value="sms"
                  checked={form.messageType === "sms"}
                  onChange={(e) => setForm({ ...form, messageType: e.target.value })}
                  className="sr-only"
                />
                <MessageSquare className={`w-5 h-5 ${form.messageType === "sms" ? "text-purple-600" : "text-gray-400"}`} />
                <div>
                  <p className={`font-medium ${form.messageType === "sms" ? "text-purple-700" : "text-gray-900"}`}>SMS</p>
                  <p className="text-sm text-gray-500">Send via text</p>
                </div>
              </label>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Message Content</h2>
            <div className="space-y-4">
              {form.messageType === "email" && (
                <Input
                  label="Subject Line"
                  placeholder="Enter subject..."
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              )}

              <Textarea
                label={form.messageType === "email" ? "Email Body" : "Message"}
                placeholder={form.messageType === "email" ? "Write your email here..." : "Write your SMS message (160 char limit)..."}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={form.messageType === "email" ? 10 : 4}
              />

              {form.messageType === "sms" && (
                <p className="text-sm text-gray-500">{form.content.length}/160 characters</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Event</span>
                <span className="text-gray-900 font-medium">
                  {form.event ? events.find(e => e.value === form.event)?.label.split(" (")[0] : "Not selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recipients</span>
                <span className="text-gray-900 font-medium">{getAudienceCount().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-900 font-medium capitalize">{form.messageType}</span>
              </div>
            </div>
          </div>

          {/* Send Button */}
          <Button 
            className="w-full" 
            onClick={handleSend}
            disabled={!form.event}
          >
            <Send className="w-4 h-4" />
            Send Message
          </Button>

          {/* Help */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Messages to ticket holders are great for event updates, 
              schedule changes, or important reminders.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
