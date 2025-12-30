import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, DoorClosed, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Toggle, useToast, ToastContainer } from "../../components/ui";

const exitPoints = [
  { id: 1, name: "Main Exit", location: "Front of building", reentryAllowed: true, status: "active" },
  { id: 2, name: "East Exit", location: "East side near restrooms", reentryAllowed: false, status: "active" },
  { id: 3, name: "Emergency Exit A", location: "North wall, stage left", reentryAllowed: false, status: "active" },
  { id: 4, name: "Emergency Exit B", location: "South wall, stage right", reentryAllowed: false, status: "active" },
  { id: 5, name: "VIP Exit", location: "VIP lounge rear door", reentryAllowed: true, status: "active" },
];

export default function ExitPoints() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedExit, setSelectedExit] = useState<typeof exitPoints[0] | null>(null);
  const [form, setForm] = useState({ name: "", location: "", reentryAllowed: false });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter exit point name");
      return;
    }
    toast.success(selectedExit ? "Exit point updated!" : "Exit point added!");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", location: "", reentryAllowed: false });
    setSelectedExit(null);
  };

  const openEdit = (exit: typeof exitPoints[0]) => {
    setSelectedExit(exit);
    setForm({ name: exit.name, location: exit.location, reentryAllowed: exit.reentryAllowed });
    setShowModal(true);
  };

  const getDropdownItems = (exit: typeof exitPoints[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(exit) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Exit point deleted"), danger: true },
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
            <h1 className="text-3xl font-bold text-gray-900">Exit Points</h1>
            <p className="text-gray-500">Manage venue exits</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          Add Exit Point
        </Button>
      </div>

      {/* Exit Points List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Re-Entry</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {exitPoints.map((exit) => (
              <tr key={exit.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <DoorClosed className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{exit.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{exit.location}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    exit.reentryAllowed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {exit.reentryAllowed ? "Allowed" : "No Re-Entry"}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                    Active
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(exit)} />
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
        title={selectedExit ? "Edit Exit Point" : "Add Exit Point"}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. Main Exit"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Location Description"
            placeholder="e.g. Front of building"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Re-Entry Allowed</p>
              <p className="text-sm text-gray-500">Guests can re-enter through this exit</p>
            </div>
            <Toggle
              enabled={form.reentryAllowed}
              onChange={(val) => setForm({ ...form, reentryAllowed: val })}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{selectedExit ? "Update" : "Add"}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
