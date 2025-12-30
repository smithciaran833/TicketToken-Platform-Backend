import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, QrCode, Calendar, MapPin, Clock } from "lucide-react";
import { Button, Select, useToast, ToastContainer } from "../../components/ui";

const templates = [
  { value: "standard", label: "Standard", description: "Clean, professional design" },
  { value: "premium", label: "Premium", description: "Elegant with gold accents" },
  { value: "minimal", label: "Minimal", description: "Simple and modern" },
  { value: "bold", label: "Bold", description: "High contrast, eye-catching" },
];

const logoPositions = [
  { value: "top-left", label: "Top Left" },
  { value: "top-center", label: "Top Center" },
  { value: "top-right", label: "Top Right" },
];

const fonts = [
  { value: "inter", label: "Inter (Modern)" },
  { value: "playfair", label: "Playfair (Elegant)" },
  { value: "roboto", label: "Roboto (Clean)" },
  { value: "montserrat", label: "Montserrat (Bold)" },
];

export default function BrandingTickets() {
  const toast = useToast();

  const [form, setForm] = useState({
    template: "standard",
    logoPosition: "top-left",
    font: "inter",
    showVenueLogo: true,
    showEventImage: true,
  });

  const handleSave = () => {
    toast.success("Ticket design saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Ticket Design</h1>
            <p className="text-gray-500">Customize how your tickets look</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Options */}
        <div className="space-y-6">
          {/* Template Selection */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Template</h2>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((template) => (
                <label
                  key={template.value}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    form.template === template.value
                      ? "border-purple-500 bg-purple-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={template.value}
                    checked={form.template === template.value}
                    onChange={(e) => setForm({ ...form, template: e.target.value })}
                    className="sr-only"
                  />
                  <p className="font-medium text-gray-900">{template.label}</p>
                  <p className="text-xs text-gray-500">{template.description}</p>
                </label>
              ))}
            </div>
          </div>

          {/* Customization */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Customization</h2>
            <div className="space-y-4">
              <Select
                label="Logo Position"
                options={logoPositions}
                value={form.logoPosition}
                onChange={(e) => setForm({ ...form, logoPosition: e.target.value })}
              />
              <Select
                label="Font"
                options={fonts}
                value={form.font}
                onChange={(e) => setForm({ ...form, font: e.target.value })}
              />
              
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showVenueLogo}
                    onChange={(e) => setForm({ ...form, showVenueLogo: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded"
                  />
                  <span className="text-gray-700">Show venue logo on ticket</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.showEventImage}
                    onChange={(e) => setForm({ ...form, showEventImage: e.target.checked })}
                    className="w-5 h-5 text-purple-600 rounded"
                  />
                  <span className="text-gray-700">Show event image on ticket</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
          
          {/* Ticket Preview */}
          <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-xl p-6 text-white shadow-xl">
            {/* Header */}
            <div className={`flex items-center mb-4 ${
              form.logoPosition === "top-center" ? "justify-center" : 
              form.logoPosition === "top-right" ? "justify-end" : "justify-start"
            }`}>
              {form.showVenueLogo && (
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-sm">GT</span>
                </div>
              )}
            </div>

            {/* Event Image */}
            {form.showEventImage && (
              <div className="h-24 bg-white/20 rounded-lg mb-4 flex items-center justify-center">
                <span className="text-white/60 text-sm">Event Image</span>
              </div>
            )}

            {/* Event Info */}
            <div className="mb-4">
              <h3 className="text-xl font-bold mb-1">Summer Music Festival</h3>
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <Calendar className="w-4 h-4" />
                <span>Jul 15, 2025</span>
                <Clock className="w-4 h-4 ml-2" />
                <span>7:00 PM</span>
              </div>
              <div className="flex items-center gap-2 text-white/80 text-sm mt-1">
                <MapPin className="w-4 h-4" />
                <span>Grand Theater</span>
              </div>
            </div>

            {/* Ticket Details */}
            <div className="border-t border-white/20 pt-4 flex items-end justify-between">
              <div>
                <p className="text-white/60 text-xs">TICKET TYPE</p>
                <p className="font-semibold">VIP Access</p>
                <p className="text-white/60 text-xs mt-2">SECTION / ROW / SEAT</p>
                <p className="font-semibold">A / 12 / 5</p>
              </div>
              <div className="w-20 h-20 bg-white rounded-lg flex items-center justify-center">
                <QrCode className="w-16 h-16 text-gray-800" />
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-500 text-center mt-4">
            This is how your tickets will appear to customers
          </p>
        </div>
      </div>
    </div>
  );
}
