import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, ClipboardList, Edit, Trash2, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Toggle, useToast, ToastContainer } from "../../components/ui";

const templates = [
  { id: 1, name: "Artist Guest List", defaultEntries: 20, plusOnes: true },
  { id: 2, name: "VIP Guest List", defaultEntries: 50, plusOnes: true },
  { id: 3, name: "Press/Media", defaultEntries: 10, plusOnes: false },
  { id: 4, name: "Industry", defaultEntries: 15, plusOnes: true },
];

export default function VIPGuestLists() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof templates[0] | null>(null);

  const [settings, setSettings] = useState({
    maxGuestsPerEvent: "100",
    autoApprove: false,
    notifyOnAdd: true,
    notifyOnCheckIn: true,
  });

  const [form, setForm] = useState({ name: "", defaultEntries: "", plusOnes: true });

  const handleSaveSettings = () => {
    toast.success("Guest list settings saved!");
  };

  const handleSaveTemplate = () => {
    if (!form.name.trim()) {
      toast.error("Please enter template name");
      return;
    }
    toast.success(selectedTemplate ? "Template updated!" : "Template created!");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setForm({ name: "", defaultEntries: "", plusOnes: true });
    setSelectedTemplate(null);
  };

  const openEdit = (template: typeof templates[0]) => {
    setSelectedTemplate(template);
    setForm({ 
      name: template.name, 
      defaultEntries: String(template.defaultEntries), 
      plusOnes: template.plusOnes 
    });
    setShowModal(true);
  };

  const getDropdownItems = (template: typeof templates[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(template) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Template deleted"), danger: true },
  ];

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
            <h1 className="text-3xl font-bold text-gray-900">Guest Lists</h1>
            <p className="text-gray-500">Configure guest list settings</p>
          </div>
        </div>
      </div>

      {/* Default Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Default Settings</h2>
        
        <div className="space-y-4">
          <Input
            label="Max Guests per Event"
            type="number"
            value={settings.maxGuestsPerEvent}
            onChange={(e) => setSettings({ ...settings, maxGuestsPerEvent: e.target.value })}
          />

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Auto-Approve Requests</p>
              <p className="text-sm text-gray-500">Automatically approve guest list submissions</p>
            </div>
            <Toggle
              enabled={settings.autoApprove}
              onChange={(val) => setSettings({ ...settings, autoApprove: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Notify on Add</p>
              <p className="text-sm text-gray-500">Send notification when guests are added</p>
            </div>
            <Toggle
              enabled={settings.notifyOnAdd}
              onChange={(val) => setSettings({ ...settings, notifyOnAdd: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Notify on Check-In</p>
              <p className="text-sm text-gray-500">Send notification when guests check in</p>
            </div>
            <Toggle
              enabled={settings.notifyOnCheckIn}
              onChange={(val) => setSettings({ ...settings, notifyOnCheckIn: val })}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings}>Save Settings</Button>
          </div>
        </div>
      </div>

      {/* Templates */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Guest List Templates</h2>
          <Button variant="secondary" size="sm" onClick={() => { resetForm(); setShowModal(true); }}>
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </div>

        <div className="space-y-3">
          {templates.map((template) => (
            <div key={template.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{template.name}</p>
                  <p className="text-sm text-gray-500">
                    {template.defaultEntries} entries • {template.plusOnes ? "+1s allowed" : "No +1s"}
                  </p>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(template)} />
            </div>
          ))}
        </div>
      </div>

      {/* Template Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={selectedTemplate ? "Edit Template" : "Create Template"}
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            placeholder="e.g. Artist Guest List"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Default Number of Entries"
            type="number"
            value={form.defaultEntries}
            onChange={(e) => setForm({ ...form, defaultEntries: e.target.value })}
          />
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Allow +1s</p>
              <p className="text-sm text-gray-500">Guests can bring one additional person</p>
            </div>
            <Toggle
              enabled={form.plusOnes}
              onChange={(val) => setForm({ ...form, plusOnes: val })}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSaveTemplate}>{selectedTemplate ? "Update" : "Create"}</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
