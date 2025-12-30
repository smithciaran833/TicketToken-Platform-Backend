import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button, Input, Textarea, Select, useToast, ToastContainer } from "../../components/ui";

const venueTypes = [
  { value: "", label: "Select venue type..." },
  { value: "theater", label: "Theater" },
  { value: "amphitheater", label: "Amphitheater" },
  { value: "arena", label: "Arena" },
  { value: "stadium", label: "Stadium" },
  { value: "club", label: "Club / Nightclub" },
  { value: "bar", label: "Bar / Lounge" },
  { value: "concert_hall", label: "Concert Hall" },
  { value: "outdoor", label: "Outdoor Venue" },
  { value: "convention", label: "Convention Center" },
  { value: "other", label: "Other" },
];

export default function AddVenue() {
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    type: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    description: "",
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Please enter venue name");
      return;
    }
    if (!form.type) {
      toast.error("Please select venue type");
      return;
    }
    if (!form.address.trim()) {
      toast.error("Please enter venue address");
      return;
    }
    toast.success("Venue created! Redirecting to setup...");
    setTimeout(() => navigate("/venues"), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venues" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Add New Venue</h1>
          <p className="text-gray-500">Create a new venue to manage</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Venue Details</h2>
          </div>

          <Input
            label="Venue Name"
            placeholder="e.g. The Grand Theater"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <Select
            label="Venue Type"
            options={venueTypes}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          />

          <Textarea
            label="Description"
            placeholder="Brief description of your venue..."
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
          />
        </div>

        {/* Address */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Location</h2>

          <Input
            label="Street Address"
            placeholder="123 Main Street"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="City"
              placeholder="New York"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              label="State"
              placeholder="NY"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
            <Input
              label="ZIP Code"
              placeholder="10001"
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
          </div>
        </div>

        {/* Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> After creating your venue, you'll be guided through the complete setup process including capacity, seating, payment settings, and more.
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Link to="/venues">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit}>Create Venue</Button>
        </div>
      </div>
    </div>
  );
}
