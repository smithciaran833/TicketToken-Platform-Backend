import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Monitor, Smartphone, Send } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function CommEmailPreview() {
  const toast = useToast();
  
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [testEmail, setTestEmail] = useState("");

  const handleSendTest = () => {
    if (!testEmail.trim()) {
      toast.error("Please enter an email address");
      return;
    }
    toast.success(`Test email sent to ${testEmail}`);
    setTestEmail("");
  };

  // Mock template data
  const template = {
    name: "Order Confirmation",
    subject: "Your tickets for Summer Music Festival",
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings/communication/email" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Preview: {template.name}</h1>
            <p className="text-gray-500">See how this email will look</p>
          </div>
        </div>
      </div>

      {/* Device Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setDevice("desktop")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              device === "desktop" ? "bg-white shadow text-gray-900" : "text-gray-600"
            }`}
          >
            <Monitor className="w-4 h-4" />
            Desktop
          </button>
          <button
            onClick={() => setDevice("mobile")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              device === "mobile" ? "bg-white shadow text-gray-900" : "text-gray-600"
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Mobile
          </button>
        </div>

        {/* Send Test */}
        <div className="flex items-center gap-2">
          <Input
            label=""
            placeholder="Enter email for test"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            className="w-64"
          />
          <Button variant="secondary" onClick={handleSendTest}>
            <Send className="w-4 h-4" />
            Send Test
          </Button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-gray-100 rounded-lg p-8">
        <div className={`mx-auto ${device === "mobile" ? "max-w-sm" : "max-w-2xl"}`}>
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Email Header */}
            <div className="bg-purple-600 px-6 py-4 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-lg">
                <span className="font-bold text-purple-600">GT</span>
              </div>
            </div>

            {/* Email Subject */}
            <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">Subject: {template.subject}</p>
            </div>

            {/* Email Body */}
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Thanks for your order, John!</h2>
              
              <p className="text-gray-600 mb-4">
                Your tickets for <strong>Summer Music Festival</strong> have been confirmed. 
                Here are your order details:
              </p>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Order Number</p>
                    <p className="font-medium">ORD-123456</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Order Date</p>
                    <p className="font-medium">December 29, 2024</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Event</p>
                    <p className="font-medium">Summer Music Festival</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Date & Time</p>
                    <p className="font-medium">July 15, 2025 at 7:00 PM</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 rounded-lg p-4 mb-6">
                <p className="font-medium text-purple-900 mb-2">Your Tickets</p>
                <p className="text-purple-700">2x VIP Access - $300.00</p>
              </div>

              <button className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium">
                View Your Tickets
              </button>

              <p className="text-sm text-gray-500 mt-6">
                If you have any questions about your order, please contact us at support@grandtheater.com
              </p>
            </div>

            {/* Email Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 text-center">
              <div className="flex justify-center gap-4 mb-3">
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
                <div className="w-8 h-8 bg-gray-200 rounded-full" />
              </div>
              <p className="text-xs text-gray-500">© 2025 Grand Theater Entertainment LLC. All rights reserved.</p>
              <p className="text-xs text-gray-400 mt-2">
                You're receiving this email because you purchased tickets from Grand Theater.
              </p>
              <p className="text-xs text-gray-400 mt-1 underline cursor-pointer">Unsubscribe</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
