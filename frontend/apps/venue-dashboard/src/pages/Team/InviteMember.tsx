import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { Button, Input, Textarea, Select, Toggle, useToast, ToastContainer } from "../../components/ui";

const roleOptions = [
  { value: "", label: "Select role..." },
  { value: "admin", label: "Admin - Full access to all features" },
  { value: "manager", label: "Manager - Manage events and team" },
  { value: "staff", label: "Staff - Limited access" },
  { value: "scanner", label: "Scanner - Scanning only" },
  { value: "custom", label: "Custom - Set specific permissions" },
];

const defaultPermissions = {
  admin: { dashboard: true, events: "full", financials: "full", settings: "full", team: "full" },
  manager: { dashboard: true, events: "full", financials: "view", settings: "view", team: "view" },
  staff: { dashboard: true, events: "view", financials: false, settings: false, team: false },
  scanner: { dashboard: false, events: false, financials: false, settings: false, team: false },
};

export default function InviteMember() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "",
    message: "",
  });

  const [permissions, setPermissions] = useState({
    dashboard: true,
    events: "view" as string | boolean,
    financials: false as string | boolean,
    settings: false as string | boolean,
    team: false as string | boolean,
  });

  const handleRoleChange = (role: string) => {
    setForm({ ...form, role });
    if (role && role !== "custom") {
      setPermissions(defaultPermissions[role as keyof typeof defaultPermissions] || permissions);
    }
  };

  const handleSubmit = () => {
    if (!form.email.trim()) {
      toast.error("Please enter email address");
      return;
    }
    if (!form.role) {
      toast.error("Please select a role");
      return;
    }
    toast.success("Invitation sent!");
    setTimeout(() => navigate("/venue/team"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invite Team Member</h1>
          <p className="text-gray-500">Add someone to your venue team</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Invitation Details</h2>
          </div>

          <Input
            label="Email Address"
            type="email"
            placeholder="colleague@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <Input
            label="Name (Optional)"
            placeholder="John Smith"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <Select
            label="Role"
            options={roleOptions}
            value={form.role}
            onChange={(e) => handleRoleChange(e.target.value)}
          />
        </div>

        {/* Permissions */}
        {form.role === "custom" && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Permissions</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Dashboard Access</p>
                  <p className="text-sm text-gray-500">View dashboard and overview stats</p>
                </div>
                <Toggle
                  enabled={permissions.dashboard as boolean}
                  onChange={(val) => setPermissions({ ...permissions, dashboard: val })}
                />
              </div>

              {["events", "financials", "settings", "team"].map((key) => (
                <div key={key} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-medium text-gray-900 capitalize">{key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {["none", "view", "edit", "full"].map((level) => (
                      <button
                        key={level}
                        onClick={() => setPermissions({ ...permissions, [key]: level === "none" ? false : level })}
                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                          (permissions[key as keyof typeof permissions] === level) ||
                          (level === "none" && !permissions[key as keyof typeof permissions])
                            ? "bg-purple-600 text-white"
                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                      >
                        {level === "none" ? "No Access" : level.charAt(0).toUpperCase() + level.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Personal Message */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <Textarea
            label="Personal Message (Optional)"
            placeholder="Add a personal note to the invitation..."
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link to="/venue/team">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit}>Send Invitation</Button>
        </div>
      </div>
    </div>
  );
}
