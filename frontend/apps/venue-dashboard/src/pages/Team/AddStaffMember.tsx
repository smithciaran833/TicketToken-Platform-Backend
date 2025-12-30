import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Send } from "lucide-react";
import { Button, Input, Select, useToast, ToastContainer } from "../../components/ui";

const roles = [
  { value: "", label: "Select a role..." },
  { value: "manager", label: "Manager" },
  { value: "box-office", label: "Box Office" },
  { value: "security", label: "Security" },
  { value: "scanner", label: "Scanner" },
  { value: "vip-host", label: "VIP Host" },
];

export default function AddStaffMember() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "",
    sendInvite: true,
  });

  const handleSubmit = () => {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Please enter staff member's name");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    if (!form.role) {
      toast.error("Please select a role");
      return;
    }

    if (form.sendInvite) {
      toast.success("Staff member added and invitation sent!");
    } else {
      toast.success("Staff member added!");
    }
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
          <h1 className="text-3xl font-bold text-gray-900">Add Staff Member</h1>
          <p className="text-gray-500">Invite a new team member</p>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name"
            placeholder="John"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
          <Input
            label="Last Name"
            placeholder="Doe"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>

        <Input
          label="Email"
          type="email"
          placeholder="john@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <Input
          label="Phone (optional)"
          type="tel"
          placeholder="(555) 123-4567"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <Select
          label="Role"
          options={roles}
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        />

        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <input
            type="checkbox"
            id="sendInvite"
            checked={form.sendInvite}
            onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
            className="w-5 h-5 text-purple-600 rounded"
          />
          <label htmlFor="sendInvite" className="cursor-pointer">
            <p className="font-medium text-gray-900">Send invitation email</p>
            <p className="text-sm text-gray-500">Staff member will receive an email to set up their account</p>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 mt-6">
        <Link to="/venue/team">
          <Button variant="secondary">Cancel</Button>
        </Link>
        <Button onClick={handleSubmit}>
          {form.sendInvite && <Send className="w-4 h-4" />}
          {form.sendInvite ? "Add & Send Invite" : "Add Staff"}
        </Button>
      </div>
    </div>
  );
}
