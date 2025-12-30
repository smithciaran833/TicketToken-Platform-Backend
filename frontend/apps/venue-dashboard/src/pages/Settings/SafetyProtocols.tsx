import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Plus, Edit, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button, Modal, ModalFooter, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

const protocols = [
  {
    id: 1,
    name: "Medical Emergency",
    description: "Response to medical incidents",
    steps: [
      "Call for on-site medical staff immediately",
      "Do not move the person unless in immediate danger",
      "Clear area and keep crowd back",
      "If trained, provide first aid until medical arrives",
      "Document incident in security log",
    ],
    expanded: false,
  },
  {
    id: 2,
    name: "Fire Emergency",
    description: "Fire response procedures",
    steps: [
      "Activate fire alarm if not already triggered",
      "Call 911",
      "Begin evacuation using nearest exit",
      "Do not use elevators",
      "Account for all staff at assembly point",
    ],
    expanded: false,
  },
  {
    id: 3,
    name: "Severe Weather",
    description: "Tornado, lightning, and storm protocols",
    steps: [
      "Monitor weather alerts",
      "If tornado warning: move guests to interior rooms",
      "If lightning: clear outdoor areas immediately",
      "Follow PA announcements for instructions",
      "Do not allow re-entry until all-clear",
    ],
    expanded: false,
  },
  {
    id: 4,
    name: "Active Threat",
    description: "Response to active threat situations",
    steps: [
      "Follow RUN-HIDE-FIGHT protocol",
      "Call 911 when safe",
      "Evacuate if safe path exists",
      "If cannot evacuate, lock/barricade doors",
      "Fight only as last resort",
    ],
    expanded: false,
  },
  {
    id: 5,
    name: "Lost Child",
    description: "Procedures for missing children",
    steps: [
      "Get detailed description from guardian",
      "Notify all security staff via radio",
      "Lock down exits if necessary",
      "Check restrooms and concession areas first",
      "Notify police if not found within 10 minutes",
    ],
    expanded: false,
  },
];

export default function SafetyProtocols() {
  const toast = useToast();
  const [items, setItems] = useState(protocols);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", steps: "" });

  const toggleExpand = (id: number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, expanded: !item.expanded } : item
    ));
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Please enter protocol name");
      return;
    }
    toast.success("Protocol added!");
    setShowModal(false);
    setForm({ name: "", description: "", steps: "" });
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
            <h1 className="text-3xl font-bold text-gray-900">Safety Protocols</h1>
            <p className="text-gray-500">Emergency response procedures</p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          Add Protocol
        </Button>
      </div>

      {/* Protocols List */}
      <div className="space-y-4">
        {items.map((protocol) => (
          <div key={protocol.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => toggleExpand(protocol.id)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{protocol.name}</p>
                  <p className="text-sm text-gray-500">{protocol.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{protocol.steps.length} steps</span>
                {protocol.expanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </button>

            {protocol.expanded && (
              <div className="px-4 pb-4 border-t border-gray-100">
                <div className="pt-4 pl-14">
                  <ol className="space-y-2">
                    {protocol.steps.map((step, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                          {index + 1}
                        </span>
                        <span className="text-gray-700">{step}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="flex gap-2 mt-4">
                    <Button variant="secondary" size="sm">
                      <Edit className="w-4 h-4" />
                      Edit
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => toast.success("Protocol deleted")}>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Protocol Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add Safety Protocol"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Protocol Name"
            placeholder="e.g. Medical Emergency"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Description"
            placeholder="Brief description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Textarea
            label="Steps (one per line)"
            placeholder="Step 1&#10;Step 2&#10;Step 3"
            value={form.steps}
            onChange={(e) => setForm({ ...form, steps: e.target.value })}
            rows={6}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>Add Protocol</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
