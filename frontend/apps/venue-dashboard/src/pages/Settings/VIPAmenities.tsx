import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Gift, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const amenities = [
  { id: 1, name: "Welcome Drink", type: "Drink", includedWith: ["VIP Ticket", "Premium Ticket"], quantity: 1 },
  { id: 2, name: "Complimentary Food Platter", type: "Food", includedWith: ["Skybox Package"], quantity: 1 },
  { id: 3, name: "Meet & Greet Photo", type: "Service", includedWith: ["Meet & Greet Package"], quantity: 1 },
  { id: 4, name: "Signed Poster", type: "Merch", includedWith: ["Meet & Greet Package", "VIP Ticket"], quantity: 1 },
  { id: 5, name: "Drink Tokens", type: "Drink", includedWith: ["VIP Ticket"], quantity: 2 },
  { id: 6, name: "Priority Entry", type: "Service", includedWith: ["VIP Ticket", "Premium Ticket"], quantity: 1 },
];

const amenityTypes = [
  { value: "drink", label: "Drink" },
  { value: "food", label: "Food" },
  { value: "merch", label: "Merchandise" },
  { value: "service", label: "Service" },
];

const ticketTypes = [
  { value: "vip", label: "VIP Ticket" },
  { value: "premium", label: "Premium Ticket" },
  { value: "backstage", label: "Backstage Pass" },
  { value: "meet-greet", label: "Meet & Greet Package" },
  { value: "skybox", label: "Skybox Package" },
];

function getTypeBadge(type: string) {
  switch (type.toLowerCase()) {
    case "drink": return "bg-blue-100 text-blue-700";
    case "food": return "bg-green-100 text-green-700";
    case "merch": return "bg-purple-100 text-purple-700";
    case "service": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function VIPAmenities() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedAmenity, setSelectedAmenity] = useState<typeof amenities[0] | null>(null);
  const [form, setForm] = useState({ 
    name: "", 
    type: "", 
    includedWith: [] as string[], 
    quantity: "1" 
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter amenity name");
      return;
    }
    toast.success(selectedAmenity ? "Amenity updated!" : "Amenity added!");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", type: "", includedWith: [], quantity: "1" });
    setSelectedAmenity(null);
  };

  const toggleTicketType = (value: string) => {
    if (form.includedWith.includes(value)) {
      setForm({ ...form, includedWith: form.includedWith.filter(t => t !== value) });
    } else {
      setForm({ ...form, includedWith: [...form.includedWith, value] });
    }
  };

  const openEdit = (amenity: typeof amenities[0]) => {
    setSelectedAmenity(amenity);
    setForm({ 
      name: amenity.name, 
      type: amenity.type.toLowerCase(), 
      includedWith: amenity.includedWith.map(t => t.toLowerCase().replace(/ /g, "-")),
      quantity: String(amenity.quantity)
    });
    setShowModal(true);
  };

  const getDropdownItems = (amenity: typeof amenities[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(amenity) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Amenity deleted"), danger: true },
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
            <h1 className="text-3xl font-bold text-gray-900">VIP Amenities</h1>
            <p className="text-gray-500">Manage perks included with VIP tickets</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }}>
          <Plus className="w-4 h-4" />
          Add Amenity
        </Button>
      </div>

      {/* Amenities Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amenity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Included With</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {amenities.map((amenity) => (
              <tr key={amenity.id}>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Gift className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{amenity.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeBadge(amenity.type)}`}>
                    {amenity.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {amenity.includedWith.map((ticket, index) => (
                      <span key={index} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                        {ticket}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{amenity.quantity}</td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(amenity)} />
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
        title={selectedAmenity ? "Edit Amenity" : "Add Amenity"}
      >
        <div className="space-y-4">
          <Input
            label="Amenity Name"
            placeholder="e.g. Welcome Drink"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Type"
            options={[{ value: "", label: "Select type..." }, ...amenityTypes]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Included With</label>
            <div className="flex flex-wrap gap-2">
              {ticketTypes.map((type) => (
                <label
                  key={type.value}
                  className={`px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    form.includedWith.includes(type.value)
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.includedWith.includes(type.value)}
                    onChange={() => toggleTicketType(type.value)}
                    className="sr-only"
                  />
                  {type.label}
                </label>
              ))}
            </div>
          </div>
          <Input
            label="Quantity per Ticket"
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{selectedAmenity ? "Update" : "Add"}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
