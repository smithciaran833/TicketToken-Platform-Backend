import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Code } from "lucide-react";
import { Button, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

const placeholders = [
  { key: "{{first_name}}", description: "Customer's first name" },
  { key: "{{event_name}}", description: "Event name" },
  { key: "{{event_date}}", description: "Event date" },
  { key: "{{event_time}}", description: "Event time" },
  { key: "{{venue_name}}", description: "Venue name" },
  { key: "{{ticket_link}}", description: "Link to view tickets" },
];

export default function CommSMSCreate() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    message: "",
  });

  const charCount = form.message.length;
  const segmentCount = charCount <= 160 ? 1 : Math.ceil(charCount / 153);

  const insertPlaceholder = (placeholder: string) => {
    setForm({ ...form, message: form.message + placeholder });
  };

  const getCharCountColor = () => {
    if (charCount <= 160) return "text-green-600";
    if (charCount <= 320) return "text-yellow-600";
    return "text-red-600";
  };

  const getPreviewMessage = () => {
    return form.message
      .replace(/{{first_name}}/g, "John")
      .replace(/{{event_name}}/g, "Summer Music Festival")
      .replace(/{{event_date}}/g, "Jul 15")
      .replace(/{{event_time}}/g, "7:00 PM")
      .replace(/{{venue_name}}/g, "Grand Theater")
      .replace(/{{ticket_link}}/g, "tkt.to/abc123");
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter template name");
      return;
    }
    if (!form.message.trim()) {
      toast.error("Please enter message content");
      return;
    }
    toast.success("Template created!");
    setTimeout(() => navigate("/venue/settings/communication/sms"), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings/communication/sms" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create SMS Template</h1>
            <p className="text-gray-500">Design a new text message template</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Template</Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Form */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <Input
              label="Template Name"
              placeholder="e.g. Event Reminder"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <div>
              <Textarea
                label="Message"
                placeholder="Type your SMS message here..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                rows={4}
              />
              <div className="flex items-center justify-between mt-2">
                <p className={`text-sm ${getCharCountColor()}`}>
                  {charCount} characters ({segmentCount} {segmentCount === 1 ? "segment" : "segments"})
                </p>
                {charCount > 160 && (
                  <p className="text-xs text-yellow-600">
                    Long messages may incur additional costs
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
            <div className="bg-gray-100 rounded-2xl p-4 max-w-sm">
              <div className="bg-purple-600 text-white rounded-2xl rounded-bl-none px-4 py-3">
                <p className="text-sm">
                  {getPreviewMessage() || "Your message preview will appear here..."}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2 ml-2">From: Grand Theater</p>
            </div>
          </div>
        </div>

        {/* Placeholders */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Code className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Placeholders</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">Click to insert into your message.</p>
          <div className="space-y-2">
            {placeholders.map((p) => (
              <button
                key={p.key}
                onClick={() => insertPlaceholder(p.key)}
                className="w-full text-left p-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <p className="font-mono text-sm text-purple-600">{p.key}</p>
                <p className="text-xs text-gray-500">{p.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              <strong>Tip:</strong> Keep messages short. Use {"{{ticket_link}}"} for a shortened URL 
              that counts fewer characters.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
