import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, ExternalLink } from "lucide-react";
import { Button, Input, Select, useToast, ToastContainer } from "../../components/ui";

const businessTypes = [
  { value: "sole-proprietor", label: "Sole Proprietor" },
  { value: "llc", label: "LLC" },
  { value: "corporation", label: "Corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "nonprofit", label: "Non-Profit" },
];

export default function LegalTax() {
  const toast = useToast();

  const [form, setForm] = useState({
    businessType: "llc",
    legalName: "Grand Theater Entertainment LLC",
    taxId: "XX-XXX4567",
    businessAddress: "123 Main Street, New York, NY 10001",
    taxExempt: false,
  });

  const handleStripeUpdate = () => {
    toast.success("Redirecting to Stripe dashboard...");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tax Information</h1>
          <p className="text-gray-500">Business and tax details</p>
        </div>
      </div>

      {/* Tax Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Business Information</h2>
        </div>

        <div className="space-y-4">
          <Select
            label="Business Type"
            options={businessTypes}
            value={form.businessType}
            onChange={(e) => setForm({ ...form, businessType: e.target.value })}
            disabled
          />

          <Input
            label="Legal Business Name"
            value={form.legalName}
            onChange={(e) => setForm({ ...form, legalName: e.target.value })}
            disabled
          />

          <Input
            label="Tax ID / EIN"
            value={form.taxId}
            onChange={(e) => setForm({ ...form, taxId: e.target.value })}
            disabled
          />

          <Input
            label="Business Address"
            value={form.businessAddress}
            onChange={(e) => setForm({ ...form, businessAddress: e.target.value })}
            disabled
          />
        </div>
      </div>

      {/* Tax Exempt Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tax Exempt Status</h2>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              form.taxExempt ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
            }`}>
              {form.taxExempt ? "Tax Exempt" : "Not Tax Exempt"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Tax exempt status is managed through Stripe. Contact support if you need to update this.
          </p>
        </div>
      </div>

      {/* Stripe Link */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-purple-900">Update via Stripe</h3>
            <p className="text-sm text-purple-700 mt-1">
              Tax information is managed through your Stripe Connect account.
            </p>
          </div>
          <Button onClick={handleStripeUpdate}>
            <ExternalLink className="w-4 h-4" />
            Open Stripe Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
