import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Edit, Copy, Trash2, Mail, MessageSquare, Lock } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const systemTemplates = [
  { id: "sys-1", name: "Order Confirmation", type: "email", description: "Sent when tickets are purchased", usedCount: 2845, editable: false },
  { id: "sys-2", name: "Ticket Delivery", type: "email", description: "Delivers tickets to customers", usedCount: 2845, editable: false },
  { id: "sys-3", name: "Event Reminder (24hr)", type: "email", description: "Automatic reminder before event", usedCount: 1230, editable: false },
  { id: "sys-4", name: "Refund Confirmation", type: "email", description: "Sent when refund is processed", usedCount: 45, editable: false },
];

const customTemplates = [
  { id: 1, name: "Monthly Newsletter", type: "email", description: "Regular subscriber update", usedCount: 12, lastModified: "Jun 25, 2025" },
  { id: 2, name: "VIP Early Access", type: "email", description: "Early bird announcements for VIPs", usedCount: 5, lastModified: "Jun 20, 2025" },
  { id: 3, name: "Event Update", type: "email", description: "Schedule or venue changes", usedCount: 8, lastModified: "Jun 15, 2025" },
  { id: 4, name: "SMS Reminder", type: "sms", description: "Short reminder text", usedCount: 3, lastModified: "Jun 10, 2025" },
];

const templateTypes = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
];

export default function MessageTemplates() {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof customTemplates[0] | null>(null);

  const [form, setForm] = useState({
    name: "",
    type: "email",
    subject: "",
    content: "",
  });

  const filteredCustom = customTemplates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    if (!form.name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    toast.success("Template created!");
    setShowCreateModal(false);
    setForm({ name: "", type: "email", subject: "", content: "" });
  };

  const handleDelete = () => {
    toast.success("Template deleted");
    setShowDeleteModal(false);
  };

  const getDropdownItems = (template: typeof customTemplates[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setSelectedTemplate(template); setShowDeleteModal(true); } },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/marketing" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Message Templates</h1>
            <p className="text-gray-500">Create reusable message templates</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" />
          New Template
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* System Templates */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Templates</h2>
        <p className="text-sm text-gray-500 mb-4">These templates are used automatically by the system and cannot be deleted.</p>
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {systemTemplates.map((template) => (
            <div key={template.id} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Lock className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{template.name}</p>
                  <p className="text-sm text-gray-500">{template.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">Used {template.usedCount}x</span>
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded">System</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Templates */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Templates</h2>
        {filteredCustom.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {filteredCustom.map((template) => (
              <div key={template.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    template.type === "email" ? "bg-purple-100" : "bg-green-100"
                  }`}>
                    {template.type === "email" ? (
                      <Mail className="w-5 h-5 text-purple-600" />
                    ) : (
                      <MessageSquare className="w-5 h-5 text-green-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{template.name}</p>
                    <p className="text-sm text-gray-500">{template.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="text-gray-900">Used {template.usedCount}x</p>
                    <p className="text-gray-500">Modified {template.lastModified}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded capitalize ${
                    template.type === "email" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
                  }`}>
                    {template.type}
                  </span>
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(template)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
            <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Custom Templates</h3>
            <p className="text-gray-500 mb-4">Create your first template to save time on future messages.</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4" />
              Create Template
            </Button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Template"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            placeholder="e.g. Monthly Newsletter"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <Select
            label="Type"
            options={templateTypes}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />

          {form.type === "email" && (
            <Input
              label="Default Subject Line"
              placeholder="Enter default subject..."
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          )}

          <Textarea
            label="Content"
            placeholder="Write your template content..."
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            rows={8}
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Tip:</strong> Use placeholders like {"{{first_name}}"}, {"{{event_name}}"}, {"{{ticket_type}}"} for personalization.
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create Template</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Template"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{selectedTemplate?.name}</strong>? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
