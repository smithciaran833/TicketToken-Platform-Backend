import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Upload } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const categoryOptions = [
  { value: "", label: "Select category..." },
  { value: "audio", label: "Audio" },
  { value: "visual", label: "Visual" },
  { value: "lighting", label: "Lighting" },
  { value: "safety", label: "Safety" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Other" },
];

export default function AddEquipment() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    category: "",
    location: "",
    serialNumber: "",
    purchaseDate: "",
    warrantyExpiry: "",
    notes: "",
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Please enter equipment name");
      return;
    }
    if (!form.category) {
      toast.error("Please select a category");
      return;
    }
    toast.success("Equipment added successfully");
    setTimeout(() => navigate("/venue/operations/equipment"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/operations/equipment" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Add Equipment</h1>
            <p className="text-gray-500">Add new equipment to inventory</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Equipment Details</h2>

          <Input
            label="Equipment Name"
            placeholder="e.g. Wireless Microphone Set"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <Select
            label="Category"
            options={categoryOptions}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />

          <Input
            label="Location"
            placeholder="e.g. Sound Booth, Storage Room A"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />

          <Input
            label="Serial Number"
            placeholder="Optional"
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
          />
        </div>

        {/* Purchase & Warranty */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Purchase & Warranty</h2>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Purchase Date"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
            />
            <Input
              label="Warranty Expiry"
              type="date"
              value={form.warrantyExpiry}
              onChange={(e) => setForm({ ...form, warrantyExpiry: e.target.value })}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Additional Info</h2>

          <Textarea
            label="Notes"
            placeholder="Any additional notes about this equipment..."
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
          />
        </div>

        {/* Photo */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Photo</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Drag photo here or click to upload</p>
            <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</p>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link to="/venue/operations/equipment">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit}>Add Equipment</Button>
        </div>
      </div>
    </div>
  );
}
