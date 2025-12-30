import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Shield, FileText, Upload, AlertTriangle, Trash2 } from "lucide-react";
import { Button, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const certificates = [
  { 
    id: 1, 
    type: "General Liability", 
    provider: "ABC Insurance Co", 
    policyNumber: "GL-123456789", 
    coverage: "$2,000,000",
    expiration: "2025-12-31",
    status: "current"
  },
  { 
    id: 2, 
    type: "Property Insurance", 
    provider: "XYZ Insurance", 
    policyNumber: "PROP-987654321", 
    coverage: "$5,000,000",
    expiration: "2025-06-30",
    status: "current"
  },
  { 
    id: 3, 
    type: "Workers Compensation", 
    provider: "ABC Insurance Co", 
    policyNumber: "WC-456789123", 
    coverage: "$1,000,000",
    expiration: "2025-03-15",
    status: "expiring"
  },
];

const insuranceTypes = [
  { value: "general-liability", label: "General Liability" },
  { value: "property", label: "Property Insurance" },
  { value: "workers-comp", label: "Workers Compensation" },
  { value: "liquor-liability", label: "Liquor Liability" },
  { value: "event-cancellation", label: "Event Cancellation" },
  { value: "cyber", label: "Cyber Liability" },
];

function getStatusBadge(_status: string, expiration: string) {
  const expirationDate = new Date(expiration);
  const today = new Date();
  const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration < 0) {
    return { label: "Expired", class: "bg-red-100 text-red-700" };
  } else if (daysUntilExpiration < 60) {
    return { label: "Expiring Soon", class: "bg-yellow-100 text-yellow-700" };
  }
  return { label: "Current", class: "bg-green-100 text-green-700" };
}

export default function LegalInsurance() {
  const toast = useToast();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: "",
    provider: "",
    policyNumber: "",
    coverage: "",
    expiration: "",
  });

  const handleUpload = () => {
    if (!form.type || !form.provider) {
      toast.error("Please fill in required fields");
      return;
    }
    toast.success("Certificate uploaded!");
    setShowModal(false);
    setForm({ type: "", provider: "", policyNumber: "", coverage: "", expiration: "" });
  };

  const handleDelete = (_id: number) => {
    toast.success("Certificate removed");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Insurance Certificates</h1>
            <p className="text-gray-500">Manage your insurance documents</p>
          </div>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4" />
          Upload Certificate
        </Button>
      </div>

      {/* Expiration Warning */}
      {certificates.some(c => getStatusBadge(c.status, c.expiration).label === "Expiring Soon") && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Insurance Expiring Soon</p>
              <p className="text-sm text-yellow-700 mt-1">
                One or more of your insurance certificates will expire within 60 days. Please renew to avoid coverage gaps.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Certificates List */}
      <div className="space-y-4">
        {certificates.map((cert) => {
          const statusBadge = getStatusBadge(cert.status, cert.expiration);
          return (
            <div key={cert.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Shield className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{cert.type}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge.class}`}>
                        {statusBadge.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{cert.provider}</p>
                    <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                      <div>
                        <p className="text-gray-400">Policy Number</p>
                        <p className="text-gray-700">{cert.policyNumber}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Coverage</p>
                        <p className="text-gray-700">{cert.coverage}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Expiration</p>
                        <p className="text-gray-700">{new Date(cert.expiration).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm">
                    <FileText className="w-4 h-4" />
                    View
                  </Button>
                  <button 
                    onClick={() => handleDelete(cert.id)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Upload Certificate"
        size="lg"
      >
        <div className="space-y-4">
          <Select
            label="Insurance Type"
            options={[{ value: "", label: "Select type..." }, ...insuranceTypes]}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />
          <Input
            label="Insurance Provider"
            placeholder="e.g. ABC Insurance Co"
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Policy Number"
              placeholder="e.g. GL-123456789"
              value={form.policyNumber}
              onChange={(e) => setForm({ ...form, policyNumber: e.target.value })}
            />
            <Input
              label="Coverage Amount"
              placeholder="e.g. $2,000,000"
              value={form.coverage}
              onChange={(e) => setForm({ ...form, coverage: e.target.value })}
            />
          </div>
          <Input
            label="Expiration Date"
            type="date"
            value={form.expiration}
            onChange={(e) => setForm({ ...form, expiration: e.target.value })}
          />
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Drop certificate file here or click to upload</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, or PNG up to 10MB</p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleUpload}>Upload Certificate</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
