import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wine, Upload, FileText } from "lucide-react";
import { Button, Input, Select, Textarea, Toggle, useToast, ToastContainer } from "../../components/ui";

const licenseTypes = [
  { value: "full", label: "Full Liquor License" },
  { value: "beer-wine", label: "Beer & Wine Only" },
  { value: "catering", label: "Catering License" },
  { value: "special-event", label: "Special Event Permit" },
];

export default function LegalLiquor() {
  const toast = useToast();

  const [hasLicense, setHasLicense] = useState(true);
  const [form, setForm] = useState({
    type: "full",
    licenseNumber: "LIQ-2024-123456",
    issuingAuthority: "New York State Liquor Authority",
    expiration: "2025-12-31",
    serviceHours: "11:00 AM - 2:00 AM",
    restrictions: "No service to visibly intoxicated persons. Last call 30 minutes before closing.",
  });

  const handleSave = () => {
    toast.success("Liquor license info saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Liquor License</h1>
            <p className="text-gray-500">Alcohol service permits</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Has License Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Wine className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Alcohol Service</h2>
              <p className="text-sm text-gray-500">This venue serves alcohol</p>
            </div>
          </div>
          <Toggle
            enabled={hasLicense}
            onChange={setHasLicense}
          />
        </div>
      </div>

      {hasLicense && (
        <>
          {/* License Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">License Details</h2>

            <div className="space-y-4">
              <Select
                label="License Type"
                options={licenseTypes}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />

              <Input
                label="License Number"
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
              />

              <Input
                label="Issuing Authority"
                value={form.issuingAuthority}
                onChange={(e) => setForm({ ...form, issuingAuthority: e.target.value })}
              />

              <Input
                label="Expiration Date"
                type="date"
                value={form.expiration}
                onChange={(e) => setForm({ ...form, expiration: e.target.value })}
              />
            </div>
          </div>

          {/* Service Restrictions */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Service Restrictions</h2>

            <div className="space-y-4">
              <Input
                label="Hours of Service"
                placeholder="e.g. 11:00 AM - 2:00 AM"
                value={form.serviceHours}
                onChange={(e) => setForm({ ...form, serviceHours: e.target.value })}
              />

              <Textarea
                label="Restrictions & Notes"
                placeholder="Any restrictions or special conditions..."
                value={form.restrictions}
                onChange={(e) => setForm({ ...form, restrictions: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          {/* Upload License */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">License Document</h2>

            <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
              <div className="flex-1">
                <p className="font-medium text-gray-900">liquor_license_2024.pdf</p>
                <p className="text-sm text-gray-500">Uploaded Jan 15, 2024</p>
              </div>
              <Button variant="secondary" size="sm">View</Button>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Upload new license document</p>
              <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG up to 10MB</p>
            </div>
          </div>
        </>
      )}

      {!hasLicense && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <Wine className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">This venue does not serve alcohol.</p>
          <p className="text-sm text-gray-400 mt-1">Toggle above to enable alcohol service and add license info.</p>
        </div>
      )}
    </div>
  );
}
