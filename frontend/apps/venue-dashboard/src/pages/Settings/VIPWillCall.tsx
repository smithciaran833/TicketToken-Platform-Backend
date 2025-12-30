import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CreditCard } from "lucide-react";
import { Button, Input, Select, Textarea, Toggle, useToast, ToastContainer } from "../../components/ui";

const idTypes = [
  { value: "government", label: "Government-issued ID" },
  { value: "passport", label: "Passport" },
  { value: "military", label: "Military ID" },
  { value: "student", label: "Student ID" },
];

const nameMatchOptions = [
  { value: "exact", label: "Exact Match Required" },
  { value: "partial", label: "Partial Match Allowed" },
  { value: "flexible", label: "Flexible (Last Name Only)" },
];

export default function VIPWillCall() {
  const toast = useToast();

  const [form, setForm] = useState({
    enabled: true,
    location: "Box Office Window 3",
    hours: "Opens 2 hours before event start",
    acceptedIds: ["government", "passport", "military"],
    nameMatch: "exact",
    originalPurchaserOnly: false,
    allowAuthorization: true,
    instructions: "Please have your confirmation email and valid photo ID ready. If picking up for someone else, you must have written authorization from the original purchaser along with a copy of their ID.",
  });

  const toggleIdType = (type: string) => {
    if (form.acceptedIds.includes(type)) {
      setForm({ ...form, acceptedIds: form.acceptedIds.filter(t => t !== type) });
    } else {
      setForm({ ...form, acceptedIds: [...form.acceptedIds, type] });
    }
  };

  const handleSave = () => {
    toast.success("Will call settings saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Will Call</h1>
            <p className="text-gray-500">Configure ticket pickup settings</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Enable Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Will Call Enabled</h2>
              <p className="text-sm text-gray-500">Allow customers to pick up tickets at the venue</p>
            </div>
          </div>
          <Toggle
            enabled={form.enabled}
            onChange={(val) => setForm({ ...form, enabled: val })}
          />
        </div>
      </div>

      {form.enabled && (
        <>
          {/* Location & Hours */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Location & Hours</h2>
            <div className="space-y-4">
              <Input
                label="Will Call Location"
                placeholder="e.g. Box Office Window 3"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
              <Input
                label="Will Call Hours"
                placeholder="e.g. Opens 2 hours before event"
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
              />
            </div>
          </div>

          {/* ID Requirements */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">ID Requirements</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Accepted ID Types</label>
                <div className="flex flex-wrap gap-2">
                  {idTypes.map((type) => (
                    <label
                      key={type.value}
                      className={`px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        form.acceptedIds.includes(type.value)
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={form.acceptedIds.includes(type.value)}
                        onChange={() => toggleIdType(type.value)}
                        className="sr-only"
                      />
                      {type.label}
                    </label>
                  ))}
                </div>
              </div>

              <Select
                label="Name Match Policy"
                options={nameMatchOptions}
                value={form.nameMatch}
                onChange={(e) => setForm({ ...form, nameMatch: e.target.value })}
              />
            </div>
          </div>

          {/* Authorization */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Authorization</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Original Purchaser Only</p>
                  <p className="text-sm text-gray-500">Only the person who bought the tickets can pick them up</p>
                </div>
                <Toggle
                  enabled={form.originalPurchaserOnly}
                  onChange={(val) => setForm({ ...form, originalPurchaserOnly: val })}
                />
              </div>

              {!form.originalPurchaserOnly && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">Allow Authorization</p>
                    <p className="text-sm text-gray-500">Purchaser can authorize someone else to pick up</p>
                  </div>
                  <Toggle
                    enabled={form.allowAuthorization}
                    onChange={(val) => setForm({ ...form, allowAuthorization: val })}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pickup Instructions</h2>
            <Textarea
              label="Instructions for Customers"
              placeholder="Instructions displayed to customers..."
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              rows={4}
            />
          </div>
        </>
      )}
    </div>
  );
}
