import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Truck, Upload, FileText } from "lucide-react";
import { Button, Input, Textarea, useToast, ToastContainer } from "../../components/ui";

export default function VenueLoadIn() {
  const toast = useToast();

  const [form, setForm] = useState({
    address: "125 Main Street (rear entrance)",
    hours: "10:00 AM - 6:00 PM",
    contactName: "Mike Thompson",
    contactPhone: "(555) 123-4567",
    contactEmail: "loadins@grandtheater.com",
    instructions: "Enter from the alley on the east side of the building. Loading dock is on the left. Maximum vehicle height: 12ft. Please call ahead to reserve dock time.\n\nEquipment elevator available - max capacity 2000 lbs.",
    stageWidth: "60",
    stageDepth: "40",
    stageHeight: "25",
    power: "200 amp 3-phase service available. Additional power drops available upon request.",
  });

  const handleSave = () => {
    toast.success("Load-in info saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Load-In Information</h1>
            <p className="text-gray-500">Info for artists and vendors</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Load-In Address */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-orange-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Load-In Details</h2>
        </div>

        <div className="space-y-4">
          <Input
            label="Load-In Address"
            placeholder="If different from venue address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Input
            label="Load-In Hours"
            placeholder="e.g. 10:00 AM - 6:00 PM"
            value={form.hours}
            onChange={(e) => setForm({ ...form, hours: e.target.value })}
          />
        </div>
      </div>

      {/* Contact Person */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Load-In Contact</h2>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Name"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
          <Input
            label="Phone"
            type="tel"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Instructions</h2>
        <Textarea
          label=""
          placeholder="Parking, unloading, equipment access, etc."
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
          rows={5}
        />
      </div>

      {/* Stage Specs */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Stage Dimensions</h2>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Width (ft)"
            type="number"
            value={form.stageWidth}
            onChange={(e) => setForm({ ...form, stageWidth: e.target.value })}
          />
          <Input
            label="Depth (ft)"
            type="number"
            value={form.stageDepth}
            onChange={(e) => setForm({ ...form, stageDepth: e.target.value })}
          />
          <Input
            label="Height (ft)"
            type="number"
            value={form.stageHeight}
            onChange={(e) => setForm({ ...form, stageHeight: e.target.value })}
          />
        </div>
      </div>

      {/* Power */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Power Specifications</h2>
        <Textarea
          label=""
          placeholder="Available power, amp service, etc."
          value={form.power}
          onChange={(e) => setForm({ ...form, power: e.target.value })}
          rows={2}
        />
      </div>

      {/* Spec Sheet Upload */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Venue Spec Sheet</h2>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-2">Upload your venue specification sheet</p>
          <p className="text-sm text-gray-500 mb-4">PDF, DOC, or DOCX up to 10MB</p>
          <Button variant="secondary">
            <Upload className="w-4 h-4" />
            Upload File
          </Button>
        </div>
      </div>
    </div>
  );
}
