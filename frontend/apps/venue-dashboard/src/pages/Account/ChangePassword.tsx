import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Check, X } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function ChangePassword() {
  const navigate = useNavigate();
  const toast = useToast();

  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const requirements = [
    { label: "At least 8 characters", met: form.newPassword.length >= 8 },
    { label: "Contains uppercase letter", met: /[A-Z]/.test(form.newPassword) },
    { label: "Contains lowercase letter", met: /[a-z]/.test(form.newPassword) },
    { label: "Contains number", met: /[0-9]/.test(form.newPassword) },
    { label: "Contains special character", met: /[!@#$%^&*]/.test(form.newPassword) },
  ];

  const passwordsMatch = form.newPassword === form.confirmPassword && form.confirmPassword.length > 0;
  const allRequirementsMet = requirements.every(r => r.met);

  const handleSave = () => {
    if (!form.currentPassword) {
      toast.error("Please enter your current password");
      return;
    }
    if (!allRequirementsMet) {
      toast.error("Please meet all password requirements");
      return;
    }
    if (!passwordsMatch) {
      toast.error("Passwords do not match");
      return;
    }
    toast.success("Password changed successfully!");
    setTimeout(() => navigate("/account/settings"), 1500);
  };

  return (
    <div className="max-w-xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/account/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Change Password</h1>
          <p className="text-gray-500">Update your account password</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {/* Current Password */}
        <div className="relative">
          <Input
            label="Current Password"
            type={showPasswords.current ? "text" : "password"}
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
          >
            {showPasswords.current ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {/* New Password */}
        <div className="relative">
          <Input
            label="New Password"
            type={showPasswords.new ? "text" : "password"}
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
          >
            {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {/* Password Requirements */}
        {form.newPassword.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Password Requirements:</p>
            <div className="space-y-1">
              {requirements.map((req, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  {req.met ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <X className="w-4 h-4 text-gray-300" />
                  )}
                  <span className={req.met ? "text-green-700" : "text-gray-500"}>
                    {req.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirm Password */}
        <div className="relative">
          <Input
            label="Confirm New Password"
            type={showPasswords.confirm ? "text" : "password"}
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
            className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
          >
            {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {form.confirmPassword.length > 0 && (
          <div className={`text-sm ${passwordsMatch ? "text-green-600" : "text-red-600"}`}>
            {passwordsMatch ? "Passwords match" : "Passwords do not match"}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4">
          <Button onClick={handleSave}>Change Password</Button>
          <Link to="/account/settings">
            <Button variant="secondary">Cancel</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
