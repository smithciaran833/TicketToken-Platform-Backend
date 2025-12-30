import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Shield } from "lucide-react";
import { Button, Select, Input, useToast, ToastContainer } from "../../components/ui";

const admins = [
  { id: 2, name: "Sarah Wilson", email: "sarah@venue.com", role: "Admin" },
  { id: 3, name: "Mike Johnson", email: "mike@venue.com", role: "Admin" },
];

export default function TransferOwnership() {
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const handleTransfer = () => {
    if (!selectedAdmin) {
      toast.error("Please select a new owner");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }
    if (!confirmed) {
      toast.error("Please confirm you understand this action");
      return;
    }
    toast.success("Ownership transferred successfully");
    setTimeout(() => navigate("/venue/team"), 1500);
  };

  const adminOptions = [
    { value: "", label: "Select new owner..." },
    ...admins.map(a => ({ value: String(a.id), label: `${a.name} (${a.email})` })),
  ];

  return (
    <div className="max-w-xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Transfer Ownership</h1>
          <p className="text-gray-500">Transfer venue ownership to another admin</p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-800">This action cannot be undone</h3>
            <p className="text-sm text-red-700 mt-1">
              Transferring ownership will make the selected person the new owner of this venue. 
              You will become an Admin and will no longer have the ability to:
            </p>
            <ul className="text-sm text-red-700 mt-2 list-disc list-inside space-y-1">
              <li>Delete the venue</li>
              <li>Transfer ownership again</li>
              <li>Remove the new owner</li>
              <li>Access billing information</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Current Owner */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Current Owner</h2>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold">
              JD
            </div>
            <div>
              <p className="font-medium text-gray-900">John Doe (You)</p>
              <p className="text-sm text-gray-500">john@venue.com</p>
            </div>
            <div className="ml-auto">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                Owner
              </span>
            </div>
          </div>
        </div>

        {/* New Owner */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">New Owner</h2>
          </div>

          <Select
            label="Select Admin"
            options={adminOptions}
            value={selectedAdmin}
            onChange={(e) => setSelectedAdmin(e.target.value)}
            helper="Only existing admins can become owners"
          />

          <Input
            label="Your Password"
            type="password"
            placeholder="Enter your password to confirm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="confirm"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <label htmlFor="confirm" className="text-sm text-gray-700">
              I understand that this action cannot be undone and I will become an Admin after the transfer.
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link to="/venue/team">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button 
            onClick={handleTransfer} 
            className="bg-red-600 hover:bg-red-700"
            disabled={!selectedAdmin || !password || !confirmed}
          >
            Transfer Ownership
          </Button>
        </div>
      </div>
    </div>
  );
}
