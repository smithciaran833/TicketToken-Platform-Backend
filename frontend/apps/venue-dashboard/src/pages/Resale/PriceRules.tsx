import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button, Input, Select, useToast, ToastContainer } from "../../components/ui";

const minPriceOptions = [
  { value: "none", label: "No Minimum" },
  { value: "percent", label: "Percentage of Face Value" },
  { value: "fixed", label: "Fixed Amount" },
];

const maxPriceOptions = [
  { value: "none", label: "No Maximum" },
  { value: "percent", label: "Percentage of Face Value" },
  { value: "fixed", label: "Fixed Amount" },
];

const eventOverrides = [
  { id: 1, event: "Tech Conference", minType: "percent", minValue: 80, maxType: "percent", maxValue: 150 },
  { id: 2, event: "Summer Music Festival", minType: "none", minValue: 0, maxType: "percent", maxValue: 200 },
];

export default function PriceRules() {
  const toast = useToast();

  const [globalRules, setGlobalRules] = useState({
    minType: "percent",
    minValue: "50",
    maxType: "percent",
    maxValue: "200",
  });

  const [previewFaceValue, setPreviewFaceValue] = useState("100");

  const calculateRange = () => {
    const faceValue = parseFloat(previewFaceValue) || 0;
    let min = 0;
    let max = Infinity;

    if (globalRules.minType === "percent") {
      min = faceValue * (parseFloat(globalRules.minValue) / 100);
    } else if (globalRules.minType === "fixed") {
      min = parseFloat(globalRules.minValue);
    }

    if (globalRules.maxType === "percent") {
      max = faceValue * (parseFloat(globalRules.maxValue) / 100);
    } else if (globalRules.maxType === "fixed") {
      max = parseFloat(globalRules.maxValue);
    }

    return { min, max };
  };

  const range = calculateRange();

  const handleSave = () => {
    toast.success("Price rules saved!");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/resale" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Price Rules</h1>
          <p className="text-gray-500">Set minimum and maximum resale prices</p>
        </div>
      </div>

      {/* Global Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Global Price Rules</h2>
        <p className="text-sm text-gray-500 mb-6">These rules apply to all events unless overridden.</p>

        <div className="grid grid-cols-2 gap-6">
          {/* Minimum Price */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Minimum Price</h3>
            <Select
              label="Rule Type"
              options={minPriceOptions}
              value={globalRules.minType}
              onChange={(e) => setGlobalRules({ ...globalRules, minType: e.target.value })}
            />
            {globalRules.minType !== "none" && (
              <Input
                label={globalRules.minType === "percent" ? "Percentage (%)" : "Amount ($)"}
                type="number"
                value={globalRules.minValue}
                onChange={(e) => setGlobalRules({ ...globalRules, minValue: e.target.value })}
              />
            )}
          </div>

          {/* Maximum Price */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900">Maximum Price</h3>
            <Select
              label="Rule Type"
              options={maxPriceOptions}
              value={globalRules.maxType}
              onChange={(e) => setGlobalRules({ ...globalRules, maxType: e.target.value })}
            />
            {globalRules.maxType !== "none" && (
              <Input
                label={globalRules.maxType === "percent" ? "Percentage (%)" : "Amount ($)"}
                type="number"
                value={globalRules.maxValue}
                onChange={(e) => setGlobalRules({ ...globalRules, maxValue: e.target.value })}
              />
            )}
          </div>
        </div>
      </div>

      {/* Preview Calculator */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6">
        <h3 className="font-medium text-purple-900 mb-4">Price Range Preview</h3>
        <div className="flex items-end gap-6">
          <div className="w-48">
            <Input
              label="Face Value ($)"
              type="number"
              value={previewFaceValue}
              onChange={(e) => setPreviewFaceValue(e.target.value)}
            />
          </div>
          <div className="flex-1 bg-white rounded-lg p-4">
            <p className="text-sm text-gray-500 mb-1">Allowed Resale Range</p>
            <p className="text-2xl font-bold text-purple-700">
              ${range.min.toFixed(2)} — {range.max === Infinity ? "No limit" : `$${range.max.toFixed(2)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Event Overrides */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Event-Specific Overrides</h2>
            <p className="text-sm text-gray-500">Custom price rules for specific events</p>
          </div>
          <Button variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
            Add Override
          </Button>
        </div>

        {eventOverrides.length > 0 ? (
          <div className="space-y-3">
            {eventOverrides.map((override) => (
              <div key={override.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{override.event}</p>
                  <p className="text-sm text-gray-500">
                    Min: {override.minType === "none" ? "No minimum" : `${override.minValue}%`} | 
                    Max: {override.maxType === "none" ? "No maximum" : `${override.maxValue}%`}
                  </p>
                </div>
                <Button variant="secondary" size="sm">Edit</Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No event-specific overrides configured.</p>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Price Rules</Button>
      </div>
    </div>
  );
}
