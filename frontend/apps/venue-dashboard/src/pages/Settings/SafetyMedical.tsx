import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Heart, MapPin, Edit, Trash2, MoreVertical, Package } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Toggle, useToast, ToastContainer } from "../../components/ui";

const medicalStations = [
  { id: 1, name: "Main First Aid Station", location: "Near main entrance", staffed: true, equipment: ["AED", "First Aid Kit", "Wheelchair", "Stretcher"] },
  { id: 2, name: "Backstage Medical", location: "Backstage area", staffed: true, equipment: ["AED", "First Aid Kit", "Oxygen"] },
  { id: 3, name: "Concourse Aid Point", location: "Upper concourse, Section 200", staffed: false, equipment: ["First Aid Kit", "AED"] },
];

const equipmentOptions = ["AED", "First Aid Kit", "Wheelchair", "Stretcher", "Oxygen", "Epinephrine", "Narcan"];

export default function SafetyMedical() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", staffed: false, equipment: [] as string[] });

  const toggleEquipment = (item: string) => {
    if (form.equipment.includes(item)) {
      setForm({ ...form, equipment: form.equipment.filter(e => e !== item) });
    } else {
      setForm({ ...form, equipment: [...form.equipment, item] });
    }
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter station name");
      return;
    }
    toast.success("Medical station added!");
    setShowModal(false);
    setForm({ name: "", location: "", staffed: false, equipment: [] });
  };

  const getDropdownItems = (_station: typeof medicalStations[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Station deleted"), danger: true },
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
            <h1 className="text-3xl font-bold text-gray-900">Medical Stations</h1>
            <p className="text-gray-500">First aid locations and equipment</p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          Add Station
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Stations</p>
          <p className="text-2xl font-bold text-gray-900">{medicalStations.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Staffed Stations</p>
          <p className="text-2xl font-bold text-green-600">{medicalStations.filter(s => s.staffed).length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">AEDs Available</p>
          <p className="text-2xl font-bold text-blue-600">{medicalStations.filter(s => s.equipment.includes("AED")).length}</p>
        </div>
      </div>

      {/* Stations List */}
      <div className="space-y-4">
        {medicalStations.map((station) => (
          <div key={station.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <Heart className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{station.name}</h3>
                    {station.staffed && (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Staffed</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
                    <MapPin className="w-4 h-4" />
                    {station.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-400" />
                    <div className="flex flex-wrap gap-1">
                      {station.equipment.map((item, index) => (
                        <span key={index} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(station)} />
            </div>
          </div>
        ))}
      </div>

      {/* Add Station Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add Medical Station"
      >
        <div className="space-y-4">
          <Input
            label="Station Name"
            placeholder="e.g. Main First Aid Station"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Location"
            placeholder="e.g. Near main entrance"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Staffed Station</p>
              <p className="text-sm text-gray-500">Medical personnel on-site</p>
            </div>
            <Toggle
              enabled={form.staffed}
              onChange={(val) => setForm({ ...form, staffed: val })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Equipment</label>
            <div className="flex flex-wrap gap-2">
              {equipmentOptions.map((item) => (
                <label
                  key={item}
                  className={`px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    form.equipment.includes(item)
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.equipment.includes(item)}
                    onChange={() => toggleEquipment(item)}
                    className="sr-only"
                  />
                  {item}
                </label>
              ))}
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>Add Station</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
