import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Phone, Plus, Edit, Trash2, AlertTriangle } from "lucide-react";
import { Button, Input, Select, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const contacts = [
  { id: 1, name: "Venue Security", phone: "(555) 123-4567", type: "security", primary: true },
  { id: 2, name: "Local Police (Non-Emergency)", phone: "(555) 234-5678", type: "police", primary: false },
  { id: 3, name: "Fire Department", phone: "(555) 345-6789", type: "fire", primary: false },
  { id: 4, name: "Poison Control", phone: "1-800-222-1222", type: "medical", primary: false },
  { id: 5, name: "Venue Manager On-Call", phone: "(555) 456-7890", type: "management", primary: false },
];

const contactTypes = [
  { value: "security", label: "Security" },
  { value: "police", label: "Police" },
  { value: "fire", label: "Fire Department" },
  { value: "medical", label: "Medical" },
  { value: "management", label: "Management" },
  { value: "other", label: "Other" },
];

export default function SafetyEmergency() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", type: "" });

  const handleSave = () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    toast.success("Contact added!");
    setShowModal(false);
    setForm({ name: "", phone: "", type: "" });
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Emergency Contacts</h1>
            <p className="text-gray-500">Important numbers for staff</p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          Add Contact
        </Button>
      </div>

      {/* 911 Reminder */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">For life-threatening emergencies, always call 911</p>
            <p className="text-sm text-red-700 mt-1">
              The contacts below are for non-emergency situations and internal coordination.
            </p>
          </div>
        </div>
      </div>

      {/* Contacts List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-200">
          {contacts.map((contact) => (
            <div key={contact.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  contact.type === "security" ? "bg-blue-100" :
                  contact.type === "police" ? "bg-indigo-100" :
                  contact.type === "fire" ? "bg-red-100" :
                  contact.type === "medical" ? "bg-green-100" :
                  "bg-gray-100"
                }`}>
                  <Phone className={`w-5 h-5 ${
                    contact.type === "security" ? "text-blue-600" :
                    contact.type === "police" ? "text-indigo-600" :
                    contact.type === "fire" ? "text-red-600" :
                    contact.type === "medical" ? "text-green-600" :
                    "text-gray-600"
                  }`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{contact.name}</p>
                    {contact.primary && (
                      <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">Primary</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{contact.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`tel:${contact.phone}`}>
                  <Button variant="secondary" size="sm">
                    <Phone className="w-4 h-4" />
                    Call
                  </Button>
                </a>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-red-500 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Contact Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add Emergency Contact"
      >
        <div className="space-y-4">
          <Input
            label="Contact Name"
            placeholder="e.g. Venue Security"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Phone Number"
            type="tel"
            placeholder="(555) 123-4567"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Select
            label="Contact Type"
            options={[{ value: "", label: "Select type..." }, ...contactTypes]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>Add Contact</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
