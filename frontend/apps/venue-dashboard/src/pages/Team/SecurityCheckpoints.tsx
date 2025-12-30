import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, MapPin, Edit, Trash2, MoreVertical, Shield, Users } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const checkpoints = [
  { id: 1, name: "Main Entrance", location: "Front of venue", type: "Entry", staffRequired: 3, status: "active" },
  { id: 2, name: "VIP Entrance", location: "Side door - East", type: "Entry", staffRequired: 2, status: "active" },
  { id: 3, name: "Bag Check", location: "Main lobby", type: "Bag Check", staffRequired: 2, status: "active" },
  { id: 4, name: "Backstage Access", location: "Rear entrance", type: "VIP", staffRequired: 1, status: "active" },
  { id: 5, name: "Main Exit", location: "Front doors", type: "Exit", staffRequired: 2, status: "inactive" },
];

const checkpointTypes = [
  { value: "entry", label: "Entry" },
  { value: "exit", label: "Exit" },
  { value: "vip", label: "VIP" },
  { value: "bag-check", label: "Bag Check" },
];

function getTypeBadge(type: string) {
  switch (type.toLowerCase()) {
    case "entry": return "bg-green-100 text-green-700";
    case "exit": return "bg-blue-100 text-blue-700";
    case "vip": return "bg-purple-100 text-purple-700";
    case "bag check": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function SecurityCheckpoints() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<typeof checkpoints[0] | null>(null);
  const [form, setForm] = useState({
    name: "",
    location: "",
    type: "",
    staffRequired: "2",
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter a checkpoint name");
      return;
    }
    toast.success(selectedCheckpoint ? "Checkpoint updated!" : "Checkpoint created!");
    setShowModal(false);
    resetForm();
  };

  const handleDelete = () => {
    toast.success("Checkpoint deleted");
    setShowDeleteModal(false);
  };

  const resetForm = () => {
    setForm({ name: "", location: "", type: "", staffRequired: "2" });
    setSelectedCheckpoint(null);
  };

  const openEdit = (checkpoint: typeof checkpoints[0]) => {
    setSelectedCheckpoint(checkpoint);
    setForm({
      name: checkpoint.name,
      location: checkpoint.location,
      type: checkpoint.type.toLowerCase().replace(" ", "-"),
      staffRequired: String(checkpoint.staffRequired),
    });
    setShowModal(true);
  };

  const getDropdownItems = (checkpoint: typeof checkpoints[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(checkpoint) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => { setSelectedCheckpoint(checkpoint); setShowDeleteModal(true); }, danger: true },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Security Checkpoints</h1>
            <p className="text-gray-500">Manage venue entry and security points</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          Add Checkpoint
        </Button>
      </div>

      {/* Checkpoints Grid */}
      <div className="grid grid-cols-2 gap-4">
        {checkpoints.map((checkpoint) => (
          <div key={checkpoint.id} className={`bg-white rounded-lg border border-gray-200 p-6 ${checkpoint.status === "inactive" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{checkpoint.name}</h3>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${getTypeBadge(checkpoint.type)}`}>
                      {checkpoint.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                    <MapPin className="w-4 h-4" />
                    {checkpoint.location}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                    <Users className="w-4 h-4" />
                    {checkpoint.staffRequired} staff required
                  </div>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(checkpoint)} />
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedCheckpoint ? "Edit Checkpoint" : "Add Checkpoint"}
      >
        <div className="space-y-4">
          <Input
            label="Checkpoint Name"
            placeholder="e.g. Main Entrance"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Location"
            placeholder="e.g. Front of venue"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <Select
            label="Type"
            options={[{ value: "", label: "Select type..." }, ...checkpointTypes]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
          <Input
            label="Staff Required"
            type="number"
            min="1"
            value={form.staffRequired}
            onChange={(e) => setForm({ ...form, staffRequired: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{selectedCheckpoint ? "Update" : "Create"}</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Checkpoint"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{selectedCheckpoint?.name}</strong>?
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
