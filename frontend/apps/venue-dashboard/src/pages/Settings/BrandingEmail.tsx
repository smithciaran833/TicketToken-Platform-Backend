import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, Eye } from "lucide-react";
import { Button, Textarea, useToast, ToastContainer } from "../../components/ui";

export default function BrandingEmail() {
  const toast = useToast();

  const [form, setForm] = useState({
    headerColor: "#9333ea",
    footerText: "© 2025 Grand Theater Entertainment LLC. All rights reserved.",
    showSocialLinks: true,
    unsubscribeText: "You're receiving this email because you purchased tickets or subscribed to updates from Grand Theater.",
  });

  const handleSave = () => {
    toast.success("Email branding saved!");
  };

  const handlePreview = () => {
    toast.success("Opening email preview...");
  };

  return (
    <div className="max-w-5xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Email Branding</h1>
            <p className="text-gray-500">Customize your email templates</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handlePreview}>
            <Eye className="w-4 h-4" />
            Preview
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Options */}
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Header</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Logo</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                  <p className="text-sm text-gray-500">Upload logo for email header</p>
                  <p className="text-xs text-gray-400">Max width: 300px</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Header Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.headerColor}
                    onChange={(e) => setForm({ ...form, headerColor: e.target.value })}
                    className="w-12 h-12 rounded-lg cursor-pointer border border-gray-300"
                  />
                  <input
                    type="text"
                    value={form.headerColor}
                    onChange={(e) => setForm({ ...form, headerColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Footer</h2>
            
            <div className="space-y-4">
              <Textarea
                label="Footer Text"
                value={form.footerText}
                onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                rows={2}
              />

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.showSocialLinks}
                  onChange={(e) => setForm({ ...form, showSocialLinks: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded"
                />
                <span className="text-gray-700">Show social media links in footer</span>
              </label>

              <Textarea
                label="Unsubscribe Text"
                value={form.unsubscribeText}
                onChange={(e) => setForm({ ...form, unsubscribeText: e.target.value })}
                rows={2}
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
          
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Email Header */}
            <div 
              className="px-6 py-4 text-center"
              style={{ backgroundColor: form.headerColor }}
            >
              <div className="inline-flex items-center justify-center w-12 h-12 bg-white rounded-lg">
                <span className="font-bold text-purple-600">GT</span>
              </div>
            </div>

            {/* Email Body */}
            <div className="p-6 bg-white">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Your Order Confirmation</h3>
              <p className="text-gray-600 mb-4">Thank you for your purchase! Here are your ticket details:</p>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="font-medium text-gray-900">Summer Music Festival</p>
                <p className="text-sm text-gray-500">July 15, 2025 at 7:00 PM</p>
                <p className="text-sm text-gray-500">2x VIP Tickets</p>
              </div>

              <button 
                className="w-full py-3 rounded-lg text-white font-medium"
                style={{ backgroundColor: form.headerColor }}
              >
                View Your Tickets
              </button>
            </div>

            {/* Email Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              {form.showSocialLinks && (
                <div className="flex justify-center gap-4 mb-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full" />
                  <div className="w-8 h-8 bg-gray-200 rounded-full" />
                  <div className="w-8 h-8 bg-gray-200 rounded-full" />
                </div>
              )}
              <p className="text-xs text-gray-500 text-center">{form.footerText}</p>
              <p className="text-xs text-gray-400 text-center mt-2">{form.unsubscribeText}</p>
              <p className="text-xs text-gray-400 text-center mt-1 underline cursor-pointer">Unsubscribe</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
