import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bug, Upload, AlertCircle } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const severityOptions = [
  { value: "", label: "Select severity..." },
  { value: "critical", label: "Critical - System unusable" },
  { value: "high", label: "High - Major feature broken" },
  { value: "medium", label: "Medium - Feature partially broken" },
  { value: "low", label: "Low - Minor issue or cosmetic" },
];

const areaOptions = [
  { value: "", label: "Select area..." },
  { value: "events", label: "Events" },
  { value: "tickets", label: "Tickets" },
  { value: "scanning", label: "Scanning" },
  { value: "analytics", label: "Analytics" },
  { value: "financials", label: "Financials" },
  { value: "settings", label: "Settings" },
  { value: "other", label: "Other" },
];

export default function BugReport() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    title: "",
    area: "",
    severity: "",
    description: "",
    steps: "",
    expected: "",
    actual: "",
  });

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    if (!form.area) {
      toast.error("Please select an area");
      return;
    }
    if (!form.severity) {
      toast.error("Please select severity");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Please describe the bug");
      return;
    }
    toast.success("Bug report submitted! We'll investigate shortly.");
    setTimeout(() => navigate("/venue/support/tickets"), 1500);
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
          <h1 className="text-3xl font-bold text-gray-900">Report a Bug</h1>
          <p className="text-gray-500">Help us improve by reporting issues</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Bug className="w-5 h-5 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Bug Details</h2>
          </div>

          <Input
            label="Title"
            placeholder="Brief description of the issue"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Area"
              options={areaOptions}
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            />
            <Select
              label="Severity"
              options={severityOptions}
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
            />
          </div>

          <Textarea
            label="Description"
            placeholder="Describe what went wrong..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
          />
        </div>

        {/* Reproduction Steps */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Steps to Reproduce</h2>

          <Textarea
            label="Steps"
            placeholder="1. Go to...&#10;2. Click on...&#10;3. Observe..."
            value={form.steps}
            onChange={(e) => setForm({ ...form, steps: e.target.value })}
            rows={4}
          />

          <div className="grid grid-cols-2 gap-4">
            <Textarea
              label="Expected Behavior"
              placeholder="What should happen?"
              value={form.expected}
              onChange={(e) => setForm({ ...form, expected: e.target.value })}
              rows={3}
            />
            <Textarea
              label="Actual Behavior"
              placeholder="What actually happened?"
              value={form.actual}
              onChange={(e) => setForm({ ...form, actual: e.target.value })}
              rows={3}
            />
          </div>
        </div>

        {/* Attachments */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Attachments</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Drag screenshots or files here</p>
            <p className="text-xs text-gray-500 mt-1">PNG, JPG, GIF up to 10MB</p>
          </div>
        </div>

        {/* System Info */}
        <div className="bg-gray-50 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-700">System information will be attached:</p>
            <p>Browser: Chrome 120, Windows 10</p>
            <p>Current page, account ID, and timestamp</p>
          </div>
        </div>

        {/* Submit */}
        <Button onClick={handleSubmit} className="w-full">Submit Bug Report</Button>
      </div>
    </div>
  );
}
