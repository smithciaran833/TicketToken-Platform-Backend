import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Edit, Trash2, MoreVertical, Shield } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

const defaultRoles = [
  { 
    id: 1, 
    name: "Manager", 
    description: "Full access to all features", 
    staffCount: 2, 
    isDefault: true,
    permissions: ["events", "tickets", "scanning", "analytics", "financials", "marketing", "resale", "team", "settings"]
  },
  { 
    id: 2, 
    name: "Box Office", 
    description: "Manage ticket sales and will call", 
    staffCount: 1, 
    isDefault: true,
    permissions: ["events", "tickets", "scanning"]
  },
  { 
    id: 3, 
    name: "Security", 
    description: "Scanning and capacity management", 
    staffCount: 2, 
    isDefault: true,
    permissions: ["scanning"]
  },
  { 
    id: 4, 
    name: "Scanner", 
    description: "Ticket scanning only", 
    staffCount: 1, 
    isDefault: true,
    permissions: ["scanning"]
  },
  { 
    id: 5, 
    name: "VIP Host", 
    description: "VIP area and guest list management", 
    staffCount: 1, 
    isDefault: true,
    permissions: ["scanning", "events"]
  },
];

const allPermissions = [
  { key: "events", label: "Events", description: "Create and manage events" },
  { key: "tickets", label: "Tickets", description: "Manage ticket types and pricing" },
  { key: "scanning", label: "Scanning", description: "Scan tickets and manage entry" },
  { key: "analytics", label: "Analytics", description: "View reports and analytics" },
  { key: "financials", label: "Financials", description: "View financial data and payouts" },
  { key: "marketing", label: "Marketing", description: "Send messages and campaigns" },
  { key: "resale", label: "Resale", description: "Manage resale marketplace" },
  { key: "team", label: "Team", description: "Manage staff and roles" },
  { key: "settings", label: "Settings", description: "Configure venue settings" },
];

export default function StaffRoles() {
  const toast = useToast();
  const [roles, _setRoles] = useState(defaultRoles);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<typeof defaultRoles[0] | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });

  const togglePermission = (key: string) => {
    if (form.permissions.includes(key)) {
      setForm({ ...form, permissions: form.permissions.filter(p => p !== key) });
    } else {
      setForm({ ...form, permissions: [...form.permissions, key] });
    }
  };

  const handleCreate = () => {
    if (!form.name.trim()) {
      toast.error("Please enter a role name");
      return;
    }
    toast.success("Role created!");
    setShowCreateModal(false);
    setForm({ name: "", description: "", permissions: [] });
  };

  const handleDelete = () => {
    toast.success("Role deleted");
    setShowDeleteModal(false);
  };

  const getDropdownItems = (role: typeof defaultRoles[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    ...(role.isDefault ? [] : [
      { divider: true, label: "", onClick: () => {} },
      { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => { setSelectedRole(role); setShowDeleteModal(true); }, danger: true },
    ]),
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
            <h1 className="text-3xl font-bold text-gray-900">Staff Roles</h1>
            <p className="text-gray-500">Define roles and permissions</p>
          </div>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" />
          Add Custom Role
        </Button>
      </div>

      {/* Roles List */}
      <div className="space-y-4">
        {roles.map((role) => (
          <div key={role.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{role.name}</h3>
                    {role.isDefault && (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Default</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{role.description}</p>
                  <p className="text-sm text-gray-400 mt-2">{role.staffCount} staff members</p>
                </div>
              </div>
              <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(role)} />
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Permissions</p>
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((perm) => (
                  <span key={perm} className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded">
                    {perm.charAt(0).toUpperCase() + perm.slice(1)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Custom Role"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Role Name"
            placeholder="e.g. Event Coordinator"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="What does this role do?"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
            <div className="space-y-2">
              {allPermissions.map((perm) => (
                <label 
                  key={perm.key}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    form.permissions.includes(perm.key) ? "border-purple-300 bg-purple-50" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div>
                    <p className="font-medium text-gray-900">{perm.label}</p>
                    <p className="text-sm text-gray-500">{perm.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(perm.key)}
                    onChange={() => togglePermission(perm.key)}
                    className="w-5 h-5 text-purple-600 rounded"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create Role</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Role"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{selectedRole?.name}</strong>? 
          Staff with this role will need to be reassigned.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
