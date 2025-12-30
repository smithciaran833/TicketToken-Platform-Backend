import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Grid, Edit, Trash2, MoreVertical, Star } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const configurations = [
  { id: 1, name: "Theater Style", type: "Theater", capacity: 2500, isDefault: true },
  { id: 2, name: "Standing Room", type: "Standing", capacity: 3000, isDefault: false },
  { id: 3, name: "Banquet", type: "Banquet", capacity: 1200, isDefault: false },
  { id: 4, name: "Cocktail", type: "Cocktail", capacity: 1800, isDefault: false },
  { id: 5, name: "Half House", type: "Theater", capacity: 1250, isDefault: false },
];

const configTypes = [
  { value: "theater", label: "Theater" },
  { value: "standing", label: "Standing" },
  { value: "banquet", label: "Banquet" },
  { value: "cocktail", label: "Cocktail" },
  { value: "classroom", label: "Classroom" },
  { value: "custom", label: "Custom" },
];

export default function SeatingConfigs() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<typeof configurations[0] | null>(null);
  const [form, setForm] = useState({ name: "", type: "", capacity: "" });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter configuration name");
      return;
    }
    toast.success(selectedConfig ? "Configuration updated!" : "Configuration created!");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", type: "", capacity: "" });
    setSelectedConfig(null);
  };

  const openEdit = (config: typeof configurations[0]) => {
    setSelectedConfig(config);
    setForm({ name: config.name, type: config.type.toLowerCase(), capacity: String(config.capacity) });
    setShowModal(true);
  };

  const setAsDefault = (_id: number) => {
    toast.success("Default configuration updated");
  };

  const getDropdownItems = (config: typeof configurations[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(config) },
    { label: "Set as Default", icon: <Star className="w-4 h-4" />, onClick: () => setAsDefault(config.id) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Configuration deleted"), danger: true },
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
            <h1 className="text-3xl font-bold text-gray-900">Seating Configurations</h1>
            <p className="text-gray-500">Manage venue seating layouts</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          Add Configuration
        </Button>
      </div>

      {/* Configurations Grid */}
      <div className="grid grid-cols-2 gap-4">
        {configurations.map((config) => (
          <div key={config.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Grid className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{config.name}</h3>
                    {config.isDefault && (
                      <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">Default</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{config.type}</p>
                  <p className="text-sm text-gray-600 mt-1">Capacity: {config.capacity.toLocaleString()}</p>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(config)} />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
              <Link to={`/venue/settings/seating/builder?config=${config.id}`}>
                <Button variant="secondary" size="sm">Edit Map</Button>
              </Link>
              <Link to={`/venue/settings/seating/preview?config=${config.id}`}>
                <Button variant="secondary" size="sm">Preview</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedConfig ? "Edit Configuration" : "Add Configuration"}
      >
        <div className="space-y-4">
          <Input
            label="Configuration Name"
            placeholder="e.g. Theater Style"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Type"
            options={[{ value: "", label: "Select type..." }, ...configTypes]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
          <Input
            label="Capacity"
            type="number"
            placeholder="e.g. 2500"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{selectedConfig ? "Update" : "Create"}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
