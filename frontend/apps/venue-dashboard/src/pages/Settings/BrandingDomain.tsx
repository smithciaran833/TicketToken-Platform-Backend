import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Globe, CheckCircle, Clock, AlertCircle, Copy, ExternalLink } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function BrandingDomain() {
  const toast = useToast();
  
  const [customDomain, setCustomDomain] = useState("tickets.grandtheater.com");
  const [status] = useState<"not-configured" | "pending" | "verified" | "active">("active");

  const dnsRecords = [
    { type: "CNAME", name: "tickets", value: "custom.tickettoken.com" },
  ];

  const handleVerify = () => {
    toast.success("Checking DNS configuration...");
  };

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard!");
  };

  const getStatusBadge = () => {
    switch (status) {
      case "active":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Active
          </span>
        );
      case "verified":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
            <CheckCircle className="w-4 h-4" />
            Verified - SSL Provisioning
          </span>
        );
      case "pending":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
            <Clock className="w-4 h-4" />
            Pending Verification
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
            <AlertCircle className="w-4 h-4" />
            Not Configured
          </span>
        );
    }
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
          <h1 className="text-3xl font-bold text-gray-900">Custom Domain</h1>
          <p className="text-gray-500">Use your own domain for ticket pages</p>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Domain Status</h2>
          {getStatusBadge()}
        </div>

        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
          <Globe className="w-5 h-5 text-gray-400" />
          <div className="flex-1">
            <p className="text-sm text-gray-500">Current Domain</p>
            <p className="font-medium text-gray-900">
              {status === "active" ? customDomain : "grandtheater.tickettoken.com"}
            </p>
          </div>
          {status === "active" && (
            <a 
              href={`https://${customDomain}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-purple-600 hover:text-purple-700"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>

      {/* Custom Domain Setup */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Domain</h2>

        <div className="space-y-4">
          <Input
            label="Your Domain"
            placeholder="tickets.yourdomain.com"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            helper="Enter the subdomain you want to use for your ticket pages"
          />

          {status !== "not-configured" && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <p className="text-sm font-medium text-gray-700">DNS Configuration</p>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-500 mb-3">
                  Add the following DNS record to your domain provider:
                </p>
                {dnsRecords.map((record, index) => (
                  <div key={index} className="bg-gray-50 rounded-lg p-3 font-mono text-sm">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Type</p>
                        <p className="text-gray-900">{record.type}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Name</p>
                        <p className="text-gray-900">{record.name}</p>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-xs text-gray-400 mb-1">Value</p>
                          <p className="text-gray-900">{record.value}</p>
                        </div>
                        <button 
                          onClick={() => handleCopy(record.value)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={handleVerify}>
              {status === "not-configured" ? "Add Domain" : "Verify DNS"}
            </Button>
            {status !== "not-configured" && (
              <Button variant="secondary">Remove Domain</Button>
            )}
          </div>
        </div>
      </div>

      {/* SSL Status */}
      {(status === "verified" || status === "active") && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">SSL Certificate</h2>
          
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-green-900">SSL Certificate Active</p>
              <p className="text-sm text-green-700">Your domain is secured with HTTPS</p>
            </div>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <p className="text-sm text-blue-800">
          <strong>Need help?</strong> Check out our{" "}
          <a href="#" className="underline">custom domain setup guide</a>{" "}
          or contact support if you're having trouble.
        </p>
      </div>
    </div>
  );
}
