import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const reentryOptions = [
  { value: "none", label: "No Re-Entry" },
  { value: "unlimited", label: "Unlimited Re-Entry" },
  { value: "single", label: "Single Re-Entry" },
  { value: "timed", label: "Time-Limited Re-Entry" },
];

const reentryMethods = [
  { value: "stamp", label: "Hand Stamp" },
  { value: "wristband", label: "Wristband" },
  { value: "scan", label: "Scan Out / Scan In" },
];

export default function ReEntryPolicy() {
  const toast = useToast();

  const [form, setForm] = useState({
    policy: "single",
    timeLimit: "60",
    method: "scan",
    policyText: "Guests may re-enter the venue one time per ticket. You must scan out at an exit and scan back in at any entrance. Re-entry is not permitted after 11:00 PM.",
  });

  const handleSave = () => {
    toast.success("Re-entry policy saved!");
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Re-Entry Policy</h1>
            <p className="text-gray-500">Configure re-entry rules</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Policy Type */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Re-Entry Type</h2>
        </div>

        <div className="space-y-3">
          {reentryOptions.map((option) => (
            <label
              key={option.value}
              className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                form.policy === option.value
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="reentryPolicy"
                value={option.value}
                checked={form.policy === option.value}
                onChange={(e) => setForm({ ...form, policy: e.target.value })}
                className="sr-only"
              />
              <span className={`font-medium ${form.policy === option.value ? "text-purple-700" : "text-gray-700"}`}>
                {option.label}
              </span>
            </label>
          ))}
        </div>

        {form.policy === "timed" && (
          <div className="mt-4">
            <Input
              label="Time Limit (minutes)"
              type="number"
              value={form.timeLimit}
              onChange={(e) => setForm({ ...form, timeLimit: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Re-Entry Method */}
      {form.policy !== "none" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Re-Entry Method</h2>
          <Select
            label="How guests verify re-entry"
            options={reentryMethods}
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
          />
          <p className="text-sm text-gray-500 mt-2">
            {form.method === "stamp" && "Staff will stamp guests' hands when exiting."}
            {form.method === "wristband" && "Guests receive a wristband for re-entry."}
            {form.method === "scan" && "Tickets are scanned out and back in using the scanning app."}
          </p>
        </div>
      )}

      {/* Policy Text */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Policy Text</h2>
        <Textarea
          label="Displayed to customers"
          value={form.policyText}
          onChange={(e) => setForm({ ...form, policyText: e.target.value })}
          rows={4}
        />
      </div>
    </div>
  );
}
