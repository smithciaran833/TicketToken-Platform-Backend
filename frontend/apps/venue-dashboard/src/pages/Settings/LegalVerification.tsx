import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, XCircle, Upload, FileText, AlertTriangle } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const requirements = [
  { id: "business-docs", label: "Business Registration Documents", status: "complete", description: "LLC or corporation paperwork" },
  { id: "tax-info", label: "Tax Information", status: "complete", description: "EIN and tax registration" },
  { id: "insurance", label: "Insurance Certificates", status: "complete", description: "Liability insurance proof" },
  { id: "ownership", label: "Proof of Ownership/Lease", status: "pending", description: "Property deed or lease agreement" },
  { id: "photo-id", label: "Owner Photo ID", status: "pending", description: "Government-issued ID" },
];

function getStatusIcon(status: string) {
  switch (status) {
    case "complete":
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case "pending":
      return <Clock className="w-5 h-5 text-yellow-500" />;
    case "rejected":
      return <XCircle className="w-5 h-5 text-red-500" />;
    default:
      return <Clock className="w-5 h-5 text-gray-400" />;
  }
}

export default function LegalVerification() {
  const toast = useToast();
  const [verificationStatus] = useState<"not-started" | "in-progress" | "verified" | "rejected">("in-progress");

  const completedCount = requirements.filter(r => r.status === "complete").length;
  const totalCount = requirements.length;
  const progress = (completedCount / totalCount) * 100;

  const handleUpload = (_reqId: string) => {
    toast.success("Document uploaded!");
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
            <h1 className="text-3xl font-bold text-gray-900">Venue Verification</h1>
            <p className="text-gray-500">Verify your venue to unlock all features</p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {verificationStatus === "in-progress" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">Verification In Progress</p>
              <p className="text-sm text-yellow-700 mt-1">
                Complete all requirements below to submit for verification. This usually takes 1-2 business days.
              </p>
            </div>
          </div>
        </div>
      )}

      {verificationStatus === "verified" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Venue Verified</p>
              <p className="text-sm text-green-700 mt-1">
                Your venue is verified and all features are unlocked.
              </p>
            </div>
          </div>
        </div>
      )}

      {verificationStatus === "rejected" && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Verification Rejected</p>
              <p className="text-sm text-red-700 mt-1">
                Please review the feedback below and resubmit the required documents.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Verification Progress</span>
          <span className="text-sm font-medium text-purple-600">{completedCount} of {totalCount} complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Requirements */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h2>

        <div className="space-y-4">
          {requirements.map((req) => (
            <div key={req.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-4">
                {getStatusIcon(req.status)}
                <div>
                  <p className="font-medium text-gray-900">{req.label}</p>
                  <p className="text-sm text-gray-500">{req.description}</p>
                </div>
              </div>
              {req.status === "complete" ? (
                <Button variant="secondary" size="sm">
                  <FileText className="w-4 h-4" />
                  View
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => handleUpload(req.id)}>
                  <Upload className="w-4 h-4" />
                  Upload
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      {completedCount === totalCount && verificationStatus !== "verified" && (
        <Link to="/venue/settings/legal/verification/submit">
          <Button size="lg" className="w-full">
            Submit for Verification
          </Button>
        </Link>
      )}

      {completedCount < totalCount && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center">
          <AlertTriangle className="w-5 h-5 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            Complete all requirements above to submit for verification.
          </p>
        </div>
      )}
    </div>
  );
}
