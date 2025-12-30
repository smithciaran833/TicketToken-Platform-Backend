import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";
import { Button, Select, Toggle, useToast, ToastContainer } from "../../components/ui";

const member = {
  id: 1,
  name: "Sarah Wilson",
  email: "sarah@venue.com",
  role: "manager",
};

const roleOptions = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "scanner", label: "Scanner" },
  { value: "custom", label: "Custom" },
];

export default function EditPermissions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [role, setRole] = useState(member.role);
  const [permissions, setPermissions] = useState({
    dashboard: { view: true },
    events: { view: true, create: true, edit: true, delete: false },
    financials: { view: true, manage: false },
    settings: { view: true, manage: false },
    team: { view: true, manage: false },
  });

  const handleSave = () => {
    toast.success("Permissions updated");
    setTimeout(() => navigate(`/venue/team/${id}`), 1500);
  };

  const updatePermission = (category: string, permission: string, value: boolean) => {
    setPermissions({
      ...permissions,
      [category]: {
        ...permissions[category as keyof typeof permissions],
        [permission]: value,
      },
    });
  };

  const permissionGroups = [
    {
      name: "Dashboard",
      key: "dashboard",
      permissions: [{ key: "view", label: "View dashboard and analytics" }],
    },
    {
      name: "Events",
      key: "events",
      permissions: [
        { key: "view", label: "View events" },
        { key: "create", label: "Create events" },
        { key: "edit", label: "Edit events" },
        { key: "delete", label: "Delete events" },
      ],
    },
    {
      name: "Financials",
      key: "financials",
      permissions: [
        { key: "view", label: "View transactions and revenue" },
        { key: "manage", label: "Process refunds and manage payouts" },
      ],
    },
    {
      name: "Settings",
      key: "settings",
      permissions: [
        { key: "view", label: "View venue settings" },
        { key: "manage", label: "Edit venue settings" },
      ],
    },
    {
      name: "Team",
      key: "team",
      permissions: [
        { key: "view", label: "View team members" },
        { key: "manage", label: "Invite and manage team members" },
      ],
    },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to={`/venue/team/${id}`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Edit Permissions</h1>
          <p className="text-gray-500">Manage access for {member.name}</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Member Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-lg font-bold text-purple-600">
              {member.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{member.name}</p>
              <p className="text-sm text-gray-500">{member.email}</p>
            </div>
            <div className="w-48">
              <Select
                label=""
                options={roleOptions}
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Permissions */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Permissions</h2>
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {permissionGroups.map((group) => (
              <div key={group.key} className="p-6">
                <h3 className="font-medium text-gray-900 mb-4">{group.name}</h3>
                <div className="space-y-3">
                  {group.permissions.map((perm) => (
                    <div key={perm.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{perm.label}</span>
                      <Toggle
                        enabled={permissions[group.key as keyof typeof permissions][perm.key as keyof typeof permissions.dashboard]}
                        onChange={(val) => updatePermission(group.key, perm.key, val)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link to={`/venue/team/${id}`}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
