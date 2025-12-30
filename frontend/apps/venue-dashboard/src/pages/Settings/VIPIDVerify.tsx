import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, IdCard } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const verificationTriggers = [
  { value: "21-events", label: "21+ Events Only" },
  { value: "will-call", label: "Will Call Pickup" },
  { value: "vip-access", label: "VIP Area Access" },
  { value: "always", label: "Always (All Events)" },
  { value: "never", label: "Never" },
];

const idTypes = [
  { id: "government", label: "Government-Issued ID", description: "Driver's license, state ID" },
  { id: "passport", label: "Passport", description: "US or foreign passport" },
  { id: "military", label: "Military ID", description: "Active or veteran military ID" },
];

const matchStrictness = [
  { value: "exact", label: "Exact Match", description: "Name must match ticket exactly" },
  { value: "partial", label: "Partial Match", description: "First and last name must match" },
  { value: "flexible", label: "Flexible", description: "Last name must match" },
];

export default function VIPIDVerify() {
  const toast = useToast();

  const [form, setForm] = useState({
    triggers: ["21-events", "will-call", "vip-access"],
    acceptedIds: ["government", "passport", "military"],
    nameMatchStrictness: "partial",
  });

  const toggleTrigger = (trigger: string) => {
    if (form.triggers.includes(trigger)) {
      setForm({ ...form, triggers: form.triggers.filter(t => t !== trigger) });
    } else {
      setForm({ ...form, triggers: [...form.triggers, trigger] });
    }
  };

  const toggleIdType = (type: string) => {
    if (form.acceptedIds.includes(type)) {
      setForm({ ...form, acceptedIds: form.acceptedIds.filter(t => t !== type) });
    } else {
      setForm({ ...form, acceptedIds: [...form.acceptedIds, type] });
    }
  };

  const handleSave = () => {
    toast.success("ID verification settings saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">ID Verification</h1>
            <p className="text-gray-500">Configure ID check requirements</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* When to Verify */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <IdCard className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">When to Verify ID</h2>
        </div>

        <div className="space-y-3">
          {verificationTriggers.map((trigger) => (
            <label
              key={trigger.value}
              className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                form.triggers.includes(trigger.value)
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={form.triggers.includes(trigger.value)}
                onChange={() => toggleTrigger(trigger.value)}
                className="w-5 h-5 text-purple-600 rounded mr-3"
              />
              <span className={`font-medium ${form.triggers.includes(trigger.value) ? "text-purple-700" : "text-gray-700"}`}>
                {trigger.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Accepted IDs */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Accepted ID Types</h2>

        <div className="space-y-3">
          {idTypes.map((type) => (
            <label
              key={type.id}
              className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                form.acceptedIds.includes(type.id)
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={form.acceptedIds.includes(type.id)}
                onChange={() => toggleIdType(type.id)}
                className="w-5 h-5 text-purple-600 rounded mr-3 mt-0.5"
              />
              <div>
                <span className={`font-medium ${form.acceptedIds.includes(type.id) ? "text-purple-700" : "text-gray-700"}`}>
                  {type.label}
                </span>
                <p className="text-sm text-gray-500">{type.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Name Match Strictness */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Name Match Strictness</h2>

        <div className="space-y-3">
          {matchStrictness.map((option) => (
            <label
              key={option.value}
              className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                form.nameMatchStrictness === option.value
                  ? "border-purple-500 bg-purple-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="strictness"
                value={option.value}
                checked={form.nameMatchStrictness === option.value}
                onChange={(e) => setForm({ ...form, nameMatchStrictness: e.target.value })}
                className="w-5 h-5 text-purple-600 mr-3 mt-0.5"
              />
              <div>
                <span className={`font-medium ${form.nameMatchStrictness === option.value ? "text-purple-700" : "text-gray-700"}`}>
                  {option.label}
                </span>
                <p className="text-sm text-gray-500">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
