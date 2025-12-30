import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, DoorOpen, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const entryPoints = [
  { id: 1, name: "Main Entrance", type: "Main", location: "Front of building, facing Main St", status: "active" },
  { id: 2, name: "VIP Entrance", type: "VIP", location: "East side, marked with VIP signage", status: "active" },
  { id: 3, name: "Will Call", type: "Will Call", location: "Left of main entrance", status: "active" },
  { id: 4, name: "Accessible Entrance", type: "Accessible", location: "Ramp access on west side", status: "active" },
  { id: 5, name: "Stage Door", type: "Staff", location: "Rear of building", status: "inactive" },
];

const entryTypes = [
  { value: "main", label: "Main" },
  { value: "vip", label: "VIP" },
  { value: "will-call", label: "Will Call" },
  { value: "accessible", label: "Accessible" },
  { value: "staff", label: "Staff Only" },
];

function getTypeBadge(type: string) {
  switch (type.toLowerCase()) {
    case "main": return "bg-green-100 text-green-700";
    case "vip": return "bg-purple-100 text-purple-700";
    case "will call": return "bg-blue-100 text-blue-700";
    case "accessible": return "bg-yellow-100 text-yellow-700";
    case "staff": return "bg-gray-100 text-gray-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function EntryPoints() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<typeof entryPoints[0] | null>(null);
  const [form, setForm] = useState({ name: "", type: "", location: "" });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter entry point name");
      return;
    }
    toast.success(selectedEntry ? "Entry point updated!" : "Entry point added!");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", type: "", location: "" });
    setSelectedEntry(null);
  };

  const openEdit = (entry: typeof entryPoints[0]) => {
    setSelectedEntry(entry);
    setForm({ name: entry.name, type: entry.type.toLowerCase().replace(" ", "-"), location: entry.location });
    setShowModal(true);
  };

  const getDropdownItems = (entry: typeof entryPoints[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(entry) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Entry point deleted"), danger: true },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Entry Points</h1>
            <p className="text-gray-500">Manage venue entrances</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          Add Entry Point
        </Button>
      </div>

      {/* Entry Points List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {entryPoints.map((entry) => (
              <tr key={entry.id} className={entry.status === "inactive" ? "opacity-50" : ""}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <DoorOpen className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{entry.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(entry.type)}`}>
                    {entry.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{entry.location}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    entry.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {entry.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(entry)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedEntry ? "Edit Entry Point" : "Add Entry Point"}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Main Entrance"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Type"
            options={[{ value: "", label: "Select type..." }, ...entryTypes]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
          <Input
            label="Location Description"
            placeholder="e.g. Front of building, facing Main St"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{selectedEntry ? "Update" : "Add"}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
