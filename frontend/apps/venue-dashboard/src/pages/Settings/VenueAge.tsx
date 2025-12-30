import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Baby } from "lucide-react";
import { Button, Select, useToast, ToastContainer } from "../../components/ui";

const agePolicies = [
  { value: "all-ages", label: "All Ages" },
  { value: "18+", label: "18+" },
  { value: "21+", label: "21+" },
  { value: "custom", label: "Custom" },
];

const idCheckOptions = [
  { value: "never", label: "Never" },
  { value: "21-only", label: "21+ Events Only" },
  { value: "always", label: "Always" },
];

export default function VenueAge() {
  const toast = useToast();

  const [form, setForm] = useState({
    defaultPolicy: "all-ages",
    customAge: "",
    idCheck: "21-only",
  });

  const handleSave = () => {
    toast.success("Age restrictions saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Age Restrictions</h1>
            <p className="text-gray-500">Default age requirements</p>
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
          <h2 className="text-lg font-semibold text-gray-900">Default Age Policy</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {agePolicies.map((policy) => (
              <label
                key={policy.value}
                className={`flex items-center justify-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  form.defaultPolicy === policy.value
                    ? "border-purple-500 bg-purple-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="agePolicy"
                  value={policy.value}
                  checked={form.defaultPolicy === policy.value}
                  onChange={(e) => setForm({ ...form, defaultPolicy: e.target.value })}
                  className="sr-only"
                />
                <span className={`font-medium ${form.defaultPolicy === policy.value ? "text-purple-700" : "text-gray-700"}`}>
                  {policy.label}
                </span>
              </label>
            ))}
          </div>

          {form.defaultPolicy === "custom" && (
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Age</label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.customAge}
                onChange={(e) => setForm({ ...form, customAge: e.target.value })}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                placeholder="e.g. 16"
              />
            </div>
          )}
        </div>
      </div>

      {/* ID Check */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ID Check Requirements</h2>
        <Select
          label="When to check IDs"
          options={idCheckOptions}
          value={form.idCheck}
          onChange={(e) => setForm({ ...form, idCheck: e.target.value })}
        />
      </div>

      {/* Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Individual events can override the default age policy. 
          This setting is used when creating new events.
        </p>
      </div>
    </div>
  );
}
