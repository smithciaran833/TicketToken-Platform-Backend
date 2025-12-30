import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Baby, AlertTriangle } from "lucide-react";
import { Button, Textarea, useToast, ToastContainer } from "../../components/ui";

const ageOptions = [
  { value: "all-ages", label: "All Ages", description: "No age restrictions" },
  { value: "18+", label: "18+", description: "Adults only (18 and over)" },
  { value: "21+", label: "21+", description: "Must be 21 or older" },
  { value: "varies", label: "Varies by Event", description: "Set per event" },
];

export default function PolicyAge() {
  const toast = useToast();

  const [form, setForm] = useState({
    defaultPolicy: "all-ages",
    idRequired: true,
    minorsRequireAdult: true,
    minorAge: "16",
    policyText: "Age requirements vary by event. Please check the event page for specific age restrictions. Valid government-issued photo ID is required for all 18+ and 21+ events. Minors under 16 must be accompanied by an adult.",
  });

  const handleSave = () => {
    toast.success("Age policy saved!");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Age Policy</h1>
            <p className="text-gray-500">Set default age requirements</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Default Policy */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Baby className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Default Age Restriction</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {ageOptions.map((option) => (
            <label
              key={option.value}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                form.defaultPolicy === option.value
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="agePolicy"
                value={option.value}
                checked={form.defaultPolicy === option.value}
                onChange={(e) => setForm({ ...form, defaultPolicy: e.target.value })}
                className="sr-only"
              />
              <p className="font-medium text-gray-900">{option.label}</p>
              <p className="text-sm text-gray-500">{option.description}</p>
            </label>
          ))}
        </div>
      </div>

      {/* ID Requirements */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ID Requirements</h2>

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              checked={form.idRequired}
              onChange={(e) => setForm({ ...form, idRequired: e.target.checked })}
              className="w-5 h-5 text-purple-600 rounded"
            />
            <div>
              <p className="font-medium text-gray-900">Require ID for age-restricted events</p>
              <p className="text-sm text-gray-500">Valid photo ID checked at entry for 18+ and 21+ events</p>
            </div>
          </label>
        </div>
      </div>

      {/* Minors Policy */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Minors Policy</h2>

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              checked={form.minorsRequireAdult}
              onChange={(e) => setForm({ ...form, minorsRequireAdult: e.target.checked })}
              className="w-5 h-5 text-purple-600 rounded"
            />
            <div>
              <p className="font-medium text-gray-900">Minors must be accompanied by an adult</p>
              <p className="text-sm text-gray-500">For all-ages events</p>
            </div>
          </label>

          {form.minorsRequireAdult && (
            <div className="pl-8">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Age considered a minor
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Under</span>
                <input
                  type="number"
                  min="10"
                  max="21"
                  value={form.minorAge}
                  onChange={(e) => setForm({ ...form, minorAge: e.target.value })}
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg"
                />
                <span className="text-gray-600">years old</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Policy Text */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Policy Text</h2>
        <Textarea
          label="Displayed on event pages"
          value={form.policyText}
          onChange={(e) => setForm({ ...form, policyText: e.target.value })}
          rows={4}
        />
      </div>

      {/* Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Note</p>
            <p className="mt-1">
              Individual events can override these defaults. Make sure staff are trained 
              on verifying IDs for age-restricted events.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
