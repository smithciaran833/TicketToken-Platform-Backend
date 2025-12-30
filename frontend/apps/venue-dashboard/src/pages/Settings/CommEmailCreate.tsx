import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, Code } from "lucide-react";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const categories = [
  { value: "", label: "Select category..." },
  { value: "order", label: "Order" },
  { value: "reminder", label: "Reminder" },
  { value: "update", label: "Update" },
  { value: "marketing", label: "Marketing" },
  { value: "follow-up", label: "Follow-up" },
];

const placeholders = [
  { key: "{{customer_name}}", description: "Customer's full name" },
  { key: "{{first_name}}", description: "Customer's first name" },
  { key: "{{event_name}}", description: "Event name" },
  { key: "{{event_date}}", description: "Event date" },
  { key: "{{event_time}}", description: "Event time" },
  { key: "{{venue_name}}", description: "Venue name" },
  { key: "{{ticket_type}}", description: "Ticket type name" },
  { key: "{{order_number}}", description: "Order number" },
  { key: "{{ticket_link}}", description: "Link to view tickets" },
];

export default function CommEmailCreate() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    category: "",
    subject: "",
    body: "",
  });

  const [showPreview, setShowPreview] = useState(false);

  const insertPlaceholder = (placeholder: string) => {
    setForm({ ...form, body: form.body + placeholder });
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter template name");
      return;
    }
    if (!form.subject.trim()) {
      toast.error("Please enter subject line");
      return;
    }
    toast.success("Template created!");
    setTimeout(() => navigate("/venue/settings/communication/email"), 1500);
  };

  const getPreviewContent = () => {
    return form.body
      .replace(/{{customer_name}}/g, "John Smith")
      .replace(/{{first_name}}/g, "John")
      .replace(/{{event_name}}/g, "Summer Music Festival")
      .replace(/{{event_date}}/g, "July 15, 2025")
      .replace(/{{event_time}}/g, "7:00 PM")
      .replace(/{{venue_name}}/g, "Grand Theater")
      .replace(/{{ticket_type}}/g, "VIP Access")
      .replace(/{{order_number}}/g, "ORD-123456")
      .replace(/{{ticket_link}}/g, "https://tickets.example.com/view");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings/communication/email" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Create Email Template</h1>
            <p className="text-gray-500">Design a new email template</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="w-4 h-4" />
            {showPreview ? "Edit" : "Preview"}
          </Button>
          <Button onClick={handleSave}>Save Template</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Form / Preview */}
        <div className="col-span-2">
          {!showPreview ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
              <Input
                label="Template Name"
                placeholder="e.g. VIP Welcome Email"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <Select
                label="Category"
                options={categories}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />

              <Input
                label="Subject Line"
                placeholder="e.g. Welcome to the VIP experience, {{first_name}}!"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />

              <Textarea
                label="Email Body"
                placeholder="Write your email content here. Use placeholders for dynamic content."
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={12}
              />
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-purple-600 px-6 py-4 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-lg">
                  <span className="font-bold text-purple-600">GT</span>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-500 mb-2">Subject: {form.subject.replace(/{{first_name}}/g, "John")}</p>
                <div className="border-t pt-4 whitespace-pre-wrap text-gray-700">
                  {getPreviewContent() || "Your email content will appear here..."}
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t text-center">
                <p className="text-xs text-gray-500">© 2025 Grand Theater Entertainment LLC</p>
              </div>
            </div>
          )}
        </div>

        {/* Placeholders Panel */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Code className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Placeholders</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">Click to insert into your email body.</p>
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
        </div>
      </div>
    </div>
  );
}
