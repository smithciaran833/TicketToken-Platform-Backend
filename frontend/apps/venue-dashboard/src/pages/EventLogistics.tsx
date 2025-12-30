import { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Input, Toggle, Textarea, Modal, ModalFooter, Select, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const venueEntryPoints = [
  { id: 1, name: "Main Entrance", enabled: true },
  { id: 2, name: "VIP Entrance", enabled: true },
  { id: 3, name: "ADA Entrance", enabled: true },
  { id: 4, name: "Artist Entrance", enabled: false },
];

const initialStaff = [
  { id: 1, name: "John Doe", role: "Manager", assignment: "Main Entrance" },
  { id: 2, name: "Sarah Johnson", role: "Security", assignment: "VIP Entrance" },
  { id: 3, name: "Mike Chen", role: "Scanner", assignment: "Main Entrance" },
];

const availableStaff = [
  { value: "jane-doe", label: "Jane Doe - Scanner" },
  { value: "bob-smith", label: "Bob Smith - Security" },
  { value: "alice-wong", label: "Alice Wong - Manager" },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Content", path: "/content" },
  { name: "Tickets", path: "/tickets" },
  { name: "Logistics", path: "/logistics" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

export default function EventLogistics() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [entryPoints, setEntryPoints] = useState(venueEntryPoints);
  const [useDefaultCapacity, setUseDefaultCapacity] = useState(true);
  const [customCapacity, setCustomCapacity] = useState(2000);
  const [overridePolicies, setOverridePolicies] = useState(false);
  const [internalNotes, setInternalNotes] = useState("VIP guests should be directed to the VIP entrance on the right side of the building. Artist entrance is on the back loading dock - staff only.");
  const [assignedStaff, setAssignedStaff] = useState(initialStaff);
  
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState("");
  const [staffAssignment, setStaffAssignment] = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Logistics settings saved!");
  };

  const toggleEntryPoint = (pointId: number) => {
    setEntryPoints(entryPoints.map(p => 
      p.id === pointId ? { ...p, enabled: !p.enabled } : p
    ));
  };

  const handleAddStaff = () => {
    if (selectedStaff && staffAssignment) {
      const staffInfo = availableStaff.find(s => s.value === selectedStaff);
      if (staffInfo) {
        const [name, role] = staffInfo.label.split(" - ");
        setAssignedStaff([...assignedStaff, {
          id: Date.now(),
          name,
          role,
          assignment: staffAssignment,
        }]);
        setShowAddStaffModal(false);
        setSelectedStaff("");
        setStaffAssignment("");
        toast.success("Staff member assigned!");
      }
    }
  };

  const removeStaff = (staffId: number) => {
    setAssignedStaff(assignedStaff.filter(s => s.id !== staffId));
    toast.success("Staff member removed");
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Event logistics</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Logistics"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Entry Points */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Entry Points</h2>
          <p className="text-sm text-gray-500 mb-4">Select which entry points will be active for this event</p>
          <div className="space-y-3">
            {entryPoints.map((point) => (
              <div key={point.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <span className="font-medium text-gray-900">{point.name}</span>
                <Toggle
                  enabled={point.enabled}
                  onChange={() => toggleEntryPoint(point.id)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Capacity */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Capacity</h2>
          <div className="space-y-4">
            <Toggle
              label="Use venue default capacity"
              description="Venue default: 2,500 people"
              enabled={useDefaultCapacity}
              onChange={setUseDefaultCapacity}
            />
            {!useDefaultCapacity && (
              <Input
                label="Custom Capacity"
                type="number"
                min="1"
                value={customCapacity}
                onChange={(e) => setCustomCapacity(parseInt(e.target.value) || 0)}
                helper="Override the venue's default capacity for this event"
              />
            )}
          </div>
        </div>

        {/* Policies */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event-Specific Policies</h2>
          <Toggle
            label="Override venue policies"
            description="Set custom policies for this event only"
            enabled={overridePolicies}
            onChange={setOverridePolicies}
          />
          {overridePolicies && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                Policy editor would go here. For now, edit policies in the venue settings.
              </p>
            </div>
          )}
        </div>

        {/* Internal Notes */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Internal Notes</h2>
          <Textarea
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            rows={4}
            placeholder="Add notes visible only to staff..."
            helper="These notes are only visible to your team, not attendees"
          />
        </div>

        {/* Staff Assignments */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Staff Assignments</h2>
            <Button variant="secondary" size="sm" onClick={() => setShowAddStaffModal(true)}>
              <Plus className="w-4 h-4" />
              <span>Add Staff</span>
            </Button>
          </div>
          <div className="space-y-3">
            {assignedStaff.map((staff) => (
              <div key={staff.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{staff.name}</p>
                  <p className="text-sm text-gray-500">{staff.role} • {staff.assignment}</p>
                </div>
                <button
                  onClick={() => removeStaff(staff.id)}
                  className="p-1 text-gray-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {assignedStaff.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">No staff assigned yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Add Staff Modal */}
      <Modal
        isOpen={showAddStaffModal}
        onClose={() => setShowAddStaffModal(false)}
        title="Assign Staff"
        size="sm"
      >
        <div className="space-y-4">
          <Select
            label="Staff Member"
            options={availableStaff}
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            placeholder="Select staff member"
          />
          <Select
            label="Assignment"
            options={entryPoints.filter(p => p.enabled).map(p => ({ value: p.name, label: p.name }))}
            value={staffAssignment}
            onChange={(e) => setStaffAssignment(e.target.value)}
            placeholder="Select entry point"
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddStaffModal(false)}>Cancel</Button>
          <Button onClick={handleAddStaff}>Assign</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
