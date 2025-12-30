import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Grid, Users, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const sections = [
  { id: 1, name: "Orchestra Center", type: "Reserved", capacity: 500, tier: "VIP" },
  { id: 2, name: "Orchestra Left", type: "Reserved", capacity: 300, tier: "Premium" },
  { id: 3, name: "Orchestra Right", type: "Reserved", capacity: 300, tier: "Premium" },
  { id: 4, name: "Mezzanine", type: "Reserved", capacity: 400, tier: "Standard" },
  { id: 5, name: "Balcony", type: "Reserved", capacity: 500, tier: "Economy" },
];

const gaZones = [
  { id: 1, name: "Floor - Front", capacity: 500 },
  { id: 2, name: "Floor - Back", capacity: 800 },
  { id: 3, name: "Standing Balcony", capacity: 300 },
];

const sectionTypes = [
  { value: "reserved", label: "Reserved Seating" },
  { value: "ga", label: "General Admission" },
];

const pricingTiers = [
  { value: "vip", label: "VIP" },
  { value: "premium", label: "Premium" },
  { value: "standard", label: "Standard" },
  { value: "economy", label: "Economy" },
];

export default function SeatingSections() {
  const toast = useToast();
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [sectionForm, setSectionForm] = useState({ name: "", type: "reserved", capacity: "", tier: "standard" });
  const [zoneForm, setZoneForm] = useState({ name: "", capacity: "" });

  const handleSaveSection = () => {
    if (!sectionForm.name.trim()) {
      toast.error("Please enter section name");
      return;
    }
    toast.success("Section saved!");
    setShowSectionModal(false);
    setSectionForm({ name: "", type: "reserved", capacity: "", tier: "standard" });
  };

  const handleSaveZone = () => {
    if (!zoneForm.name.trim()) {
      toast.error("Please enter zone name");
      return;
    }
    toast.success("Zone saved!");
    setShowZoneModal(false);
    setZoneForm({ name: "", capacity: "" });
  };

  const getSectionDropdownItems = (_section: typeof sections[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Section deleted"), danger: true },
  ];

  const getZoneDropdownItems = (_zone: typeof gaZones[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Zone deleted"), danger: true },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sections & Zones</h1>
          <p className="text-gray-500">Manage seating sections and GA zones</p>
        </div>
      </div>

      {/* Reserved Sections */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Grid className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Reserved Sections</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowSectionModal(true)}>
            <Plus className="w-4 h-4" />
            Add Section
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capacity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pricing Tier</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sections.map((section) => (
                <tr key={section.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{section.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{section.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{section.capacity}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">
                      {section.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getSectionDropdownItems(section)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GA Zones */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">General Admission Zones</h2>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowZoneModal(true)}>
            <Plus className="w-4 h-4" />
            Add Zone
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Capacity</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {gaZones.map((zone) => (
                <tr key={zone.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{zone.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{zone.capacity}</td>
                  <td className="px-4 py-3 text-right">
                    <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getZoneDropdownItems(zone)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Section Modal */}
      <Modal
        isOpen={showSectionModal}
        onClose={() => setShowSectionModal(false)}
        title="Add Section"
      >
        <div className="space-y-4">
          <Input
            label="Section Name"
            placeholder="e.g. Orchestra Center"
            value={sectionForm.name}
            onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
          />
          <Select
            label="Type"
            options={sectionTypes}
            value={sectionForm.type}
            onChange={(e) => setSectionForm({ ...sectionForm, type: e.target.value })}
          />
          <Input
            label="Capacity"
            type="number"
            value={sectionForm.capacity}
            onChange={(e) => setSectionForm({ ...sectionForm, capacity: e.target.value })}
          />
          <Select
            label="Pricing Tier"
            options={pricingTiers}
            value={sectionForm.tier}
            onChange={(e) => setSectionForm({ ...sectionForm, tier: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowSectionModal(false)}>Cancel</Button>
          <Button onClick={handleSaveSection}>Add Section</Button>
        </ModalFooter>
      </Modal>

      {/* Add Zone Modal */}
      <Modal
        isOpen={showZoneModal}
        onClose={() => setShowZoneModal(false)}
        title="Add GA Zone"
      >
        <div className="space-y-4">
          <Input
            label="Zone Name"
            placeholder="e.g. Floor - Front"
            value={zoneForm.name}
            onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
          />
          <Input
            label="Capacity"
            type="number"
            value={zoneForm.capacity}
            onChange={(e) => setZoneForm({ ...zoneForm, capacity: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowZoneModal(false)}>Cancel</Button>
          <Button onClick={handleSaveZone}>Add Zone</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
