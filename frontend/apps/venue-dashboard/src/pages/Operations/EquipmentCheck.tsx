import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { Button, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const eventOptions = [
  { value: "", label: "General Check (No Event)" },
  { value: "1", label: "Summer Music Festival - Jul 15, 2025" },
  { value: "2", label: "Jazz Night - Jul 20, 2025" },
  { value: "3", label: "Comedy Show - Jul 25, 2025" },
];

const equipmentToCheck = [
  { id: 1, name: "Main PA System", category: "Audio", location: "Main Stage" },
  { id: 2, name: "Backup Speakers", category: "Audio", location: "Storage" },
  { id: 3, name: "LED Wall Panel A", category: "Visual", location: "Main Stage" },
  { id: 4, name: "Spotlight #1", category: "Lighting", location: "Rigging A" },
  { id: 5, name: "Spotlight #2", category: "Lighting", location: "Rigging B" },
  { id: 6, name: "Emergency Exit Lights", category: "Safety", location: "All Exits" },
  { id: 7, name: "Fire Extinguishers", category: "Safety", location: "Various" },
  { id: 8, name: "Wireless Microphones", category: "Audio", location: "Sound Booth" },
];

type CheckStatus = "unchecked" | "working" | "issue";

export default function EquipmentCheck() {
  const toast = useToast();
  const navigate = useNavigate();

  const [event, setEvent] = useState("");
  const [checks, setChecks] = useState<Record<number, { status: CheckStatus; notes: string }>>({});
  const [overallNotes, setOverallNotes] = useState("");

  const updateCheck = (id: number, status: CheckStatus) => {
    setChecks({
      ...checks,
      [id]: { ...checks[id], status, notes: checks[id]?.notes || "" }
    });
  };

  const updateNotes = (id: number, notes: string) => {
    setChecks({
      ...checks,
      [id]: { ...checks[id], notes, status: checks[id]?.status || "unchecked" }
    });
  };

  const getCheckStatus = (id: number): CheckStatus => {
    return checks[id]?.status || "unchecked";
  };

  const handleComplete = () => {
    const unchecked = equipmentToCheck.filter(e => getCheckStatus(e.id) === "unchecked");
    if (unchecked.length > 0) {
      toast.error(`Please check all equipment (${unchecked.length} remaining)`);
      return;
    }
    toast.success("Equipment check completed!");
    setTimeout(() => navigate("/venue/operations/equipment"), 1500);
  };

  const checkedCount = equipmentToCheck.filter(e => getCheckStatus(e.id) !== "unchecked").length;
  const issueCount = equipmentToCheck.filter(e => getCheckStatus(e.id) === "issue").length;

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/operations/equipment" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Equipment Check</h1>
            <p className="text-gray-500">Verify equipment status</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Progress</p>
          <p className="text-lg font-semibold text-gray-900">{checkedCount} / {equipmentToCheck.length}</p>
        </div>
      </div>

      {/* Event Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <Select
          label="Event (Optional)"
          options={eventOptions}
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          helper="Select an event if this check is for a specific event"
        />
      </div>

      {/* Equipment Checklist */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Equipment Checklist</h2>
            {issueCount > 0 && (
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
                {issueCount} issues found
              </span>
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-200">
          {equipmentToCheck.map((item) => {
            const status = getCheckStatus(item.id);
            return (
              <div key={item.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.category} • {item.location}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateCheck(item.id, "working")}
                      className={`p-2 rounded-lg border transition-colors ${
                        status === "working"
                          ? "border-green-500 bg-green-50 text-green-600"
                          : "border-gray-200 text-gray-400 hover:border-green-300"
                      }`}
                    >
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => updateCheck(item.id, "issue")}
                      className={`p-2 rounded-lg border transition-colors ${
                        status === "issue"
                          ? "border-red-500 bg-red-50 text-red-600"
                          : "border-gray-200 text-gray-400 hover:border-red-300"
                      }`}
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {status === "issue" && (
                  <input
                    type="text"
                    placeholder="Describe the issue..."
                    value={checks[item.id]?.notes || ""}
                    onChange={(e) => updateNotes(item.id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mt-2"
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall Notes */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <Textarea
          label="Overall Notes"
          placeholder="Any general observations from this check..."
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Link to="/venue/operations/equipment">
          <Button variant="secondary">Cancel</Button>
        </Link>
        <Button onClick={handleComplete}>Complete Check</Button>
      </div>
    </div>
  );
}
