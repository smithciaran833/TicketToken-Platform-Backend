import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, FileText, AlertTriangle } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const requirements = [
  { id: "business-docs", label: "Business Registration Documents", status: "complete" },
  { id: "tax-info", label: "Tax Information", status: "complete" },
  { id: "insurance", label: "Insurance Certificates", status: "complete" },
  { id: "ownership", label: "Proof of Ownership/Lease", status: "complete" },
  { id: "photo-id", label: "Owner Photo ID", status: "complete" },
];

export default function LegalVerificationSubmit() {
  const toast = useToast();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!agreed) {
      toast.error("Please agree to the declaration");
      return;
    }

    setSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    toast.success("Verification submitted successfully!");
    setTimeout(() => navigate("/venue/settings/legal/verification"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/settings/legal/verification" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Submit for Verification</h1>
          <p className="text-gray-500">Review and submit your verification</p>
        </div>
      </div>

      {/* Checklist Review */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Requirements Checklist</h2>

        <div className="space-y-3">
          {requirements.map((req) => (
            <div key={req.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-800">{req.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Document Review */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Uploaded Documents</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">business_registration.pdf</p>
              <p className="text-xs text-gray-500">Uploaded Dec 15, 2024</p>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">tax_ein_certificate.pdf</p>
              <p className="text-xs text-gray-500">Uploaded Dec 15, 2024</p>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">liability_insurance.pdf</p>
              <p className="text-xs text-gray-500">Uploaded Dec 16, 2024</p>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">lease_agreement.pdf</p>
              <p className="text-xs text-gray-500">Uploaded Dec 17, 2024</p>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">owner_id.jpg</p>
              <p className="text-xs text-gray-500">Uploaded Dec 17, 2024</p>
            </div>
            <Button variant="secondary" size="sm">View</Button>
          </div>
        </div>
      </div>

      {/* Declaration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Declaration</h2>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-5 h-5 text-purple-600 rounded mt-0.5"
          />
          <span className="text-sm text-gray-600">
            I declare that all information and documents provided are accurate and truthful. 
            I understand that providing false information may result in rejection of verification 
            and potential account suspension. I authorize TicketToken to verify this information 
            with relevant authorities.
          </span>
        </label>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">What happens next?</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Our team will review your documents within 1-2 business days</li>
              <li>You'll receive an email notification with the result</li>
              <li>If additional information is needed, we'll contact you</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link to="/venue/settings/legal/verification">
          <Button variant="secondary">Cancel</Button>
        </Link>
        <Button onClick={handleSubmit} disabled={!agreed || submitting}>
          {submitting ? "Submitting..." : "Submit for Verification"}
        </Button>
      </div>
    </div>
  );
}
