import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, X, Plus } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const eventOptions = [
  { value: "", label: "Select event..." },
  { value: "1", label: "Summer Music Festival - Jul 15, 2025" },
  { value: "2", label: "Jazz Night - Jul 20, 2025" },
  { value: "3", label: "Comedy Show - Jul 25, 2025" },
];

const incidentTypes = [
  { value: "", label: "Select type..." },
  { value: "medical", label: "Medical" },
  { value: "security", label: "Security" },
  { value: "damage", label: "Damage/Property" },
  { value: "complaint", label: "Customer Complaint" },
  { value: "staff", label: "Staff Issue" },
  { value: "other", label: "Other" },
];

const severityLevels = [
  { value: "low", label: "Low", description: "Minor issue, no immediate action needed" },
  { value: "medium", label: "Medium", description: "Requires attention but not urgent" },
  { value: "high", label: "High", description: "Urgent, requires immediate response" },
  { value: "critical", label: "Critical", description: "Emergency, all hands on deck" },
];

export default function LogIncident() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    event: "",
    type: "",
    severity: "medium",
    location: "",
    description: "",
    actionsTaken: "",
    witnesses: "",
  });

  const [involvedPeople, setInvolvedPeople] = useState<{ type: string; name: string; details: string }[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);

  const addPerson = () => {
    setInvolvedPeople([...involvedPeople, { type: "customer", name: "", details: "" }]);
  };

  const removePerson = (index: number) => {
    setInvolvedPeople(involvedPeople.filter((_, i) => i !== index));
  };

  const updatePerson = (index: number, field: string, value: string) => {
    const updated = [...involvedPeople];
    updated[index] = { ...updated[index], [field]: value };
    setInvolvedPeople(updated);
  };

  const handleSubmit = () => {
    if (!form.event) {
      toast.error("Please select an event");
      return;
    }
    if (!form.type) {
      toast.error("Please select incident type");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Please enter a description");
      return;
    }
    toast.success("Incident logged successfully");
    setTimeout(() => navigate("/venue/operations/incidents"), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/operations/incidents" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Log Incident</h1>
            <p className="text-gray-500">Record a new incident report</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Incident Details</h2>

          <Select
            label="Event"
            options={eventOptions}
            value={form.event}
            onChange={(e) => setForm({ ...form, event: e.target.value })}
          />

          <Select
            label="Incident Type"
            options={incidentTypes}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
            <div className="grid grid-cols-4 gap-3">
              {severityLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setForm({ ...form, severity: level.value })}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    form.severity === level.value
                      ? level.value === "critical" ? "border-red-500 bg-red-50" :
                        level.value === "high" ? "border-orange-500 bg-orange-50" :
                        level.value === "medium" ? "border-yellow-500 bg-yellow-50" :
                        "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className={`font-medium ${
                    level.value === "critical" ? "text-red-700" :
                    level.value === "high" ? "text-orange-700" :
                    level.value === "medium" ? "text-yellow-700" :
                    "text-green-700"
                  }`}>{level.label}</p>
                  <p className="text-xs text-gray-500 mt-1">{level.description}</p>
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Location"
            placeholder="e.g. Section B, Row 5"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />

          <Textarea
            label="Description"
            placeholder="Describe what happened..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={4}
          />
        </div>

        {/* People Involved */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">People Involved</h2>
            <Button variant="secondary" size="sm" onClick={addPerson}>
              <Plus className="w-4 h-4" />
              Add Person
            </Button>
          </div>

          {involvedPeople.length === 0 ? (
            <p className="text-sm text-gray-500">No people added yet.</p>
          ) : (
            <div className="space-y-4">
              {involvedPeople.map((person, index) => (
                <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1 grid grid-cols-3 gap-4">
                    <select
                      value={person.type}
                      onChange={(e) => updatePerson(index, "type", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="customer">Customer</option>
                      <option value="staff">Staff</option>
                      <option value="external">External</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Name"
                      value={person.name}
                      onChange={(e) => updatePerson(index, "name", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Details (phone, ticket #)"
                      value={person.details}
                      onChange={(e) => updatePerson(index, "details", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <button onClick={() => removePerson(index)} className="p-2 text-gray-400 hover:text-red-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions & Notes */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Response</h2>

          <Textarea
            label="Actions Taken"
            placeholder="Describe what was done to address the incident..."
            value={form.actionsTaken}
            onChange={(e) => setForm({ ...form, actionsTaken: e.target.value })}
            rows={3}
          />

          <Input
            label="Witnesses"
            placeholder="Names or descriptions of witnesses"
            value={form.witnesses}
            onChange={(e) => setForm({ ...form, witnesses: e.target.value })}
          />
        </div>

        {/* Photos */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Photos</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Drag photos here or click to upload</p>
            <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB each</p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link to="/venue/operations/incidents">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit}>Log Incident</Button>
        </div>
      </div>
    </div>
  );
}
