import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Crown, MapPin, Users, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

const vipAreas = [
  { id: 1, name: "VIP Lounge", location: "Second floor, east wing", capacity: 100, amenities: ["Private bar", "Seating", "Restrooms"] },
  { id: 2, name: "Green Room", location: "Backstage", capacity: 30, amenities: ["Catering", "Private restroom", "WiFi"] },
  { id: 3, name: "Skybox 1", location: "Upper level", capacity: 20, amenities: ["Private bar", "Catering", "Best views"] },
  { id: 4, name: "Skybox 2", location: "Upper level", capacity: 20, amenities: ["Private bar", "Catering", "Best views"] },
  { id: 5, name: "Meet & Greet Room", location: "Near stage entrance", capacity: 50, amenities: ["Photo backdrop", "Security"] },
];

export default function VIPAreas() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedArea, setSelectedArea] = useState<typeof vipAreas[0] | null>(null);
  const [form, setForm] = useState({ name: "", location: "", capacity: "", amenities: "" });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter area name");
      return;
    }
    toast.success(selectedArea ? "VIP area updated!" : "VIP area added!");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", location: "", capacity: "", amenities: "" });
    setSelectedArea(null);
  };

  const openEdit = (area: typeof vipAreas[0]) => {
    setSelectedArea(area);
    setForm({ 
      name: area.name, 
      location: area.location, 
      capacity: String(area.capacity), 
      amenities: area.amenities.join(", ") 
    });
    setShowModal(true);
  };

  const getDropdownItems = (area: typeof vipAreas[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(area) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("VIP area deleted"), danger: true },
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
            <h1 className="text-3xl font-bold text-gray-900">VIP Areas</h1>
            <p className="text-gray-500">Manage VIP spaces and lounges</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          Add VIP Area
        </Button>
      </div>

      {/* VIP Areas Grid */}
      <div className="grid grid-cols-2 gap-4">
        {vipAreas.map((area) => (
          <div key={area.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Crown className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{area.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                    <MapPin className="w-4 h-4" />
                    {area.location}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                    <Users className="w-4 h-4" />
                    Capacity: {area.capacity}
                  </div>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(area)} />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Amenities</p>
              <div className="flex flex-wrap gap-1">
                {area.amenities.map((amenity, index) => (
                  <span key={index} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedArea ? "Edit VIP Area" : "Add VIP Area"}
      >
        <div className="space-y-4">
          <Input
            label="Area Name"
            placeholder="e.g. VIP Lounge"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Location"
            placeholder="e.g. Second floor, east wing"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <Input
            label="Capacity"
            type="number"
            placeholder="e.g. 100"
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <Textarea
            label="Amenities"
            placeholder="Private bar, Seating, Restrooms (comma separated)"
            value={form.amenities}
            onChange={(e) => setForm({ ...form, amenities: e.target.value })}
            rows={2}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{selectedArea ? "Update" : "Add"}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
