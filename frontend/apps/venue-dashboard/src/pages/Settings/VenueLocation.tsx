import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MapPin } from "lucide-react";
import { Button, Input, Select, useToast, ToastContainer } from "../../components/ui";

const countries = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "UK", label: "United Kingdom" },
];

const states = [
  { value: "NY", label: "New York" },
  { value: "CA", label: "California" },
  { value: "TX", label: "Texas" },
  { value: "FL", label: "Florida" },
];

export default function VenueLocation() {
  const toast = useToast();
  const [form, setForm] = useState({
    street: "123 Main Street",
    street2: "",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "US",
    lat: "40.7128",
    lng: "-74.0060",
  });

  const handleSave = () => {
    toast.success("Location saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Location</h1>
            <p className="text-gray-500">Venue address and map location</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Address Form */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
          
          <Input
            label="Street Address"
            value={form.street}
            onChange={(e) => setForm({ ...form, street: e.target.value })}
          />

          <Input
            label="Address Line 2"
            placeholder="Suite, floor, etc."
            value={form.street2}
            onChange={(e) => setForm({ ...form, street2: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="City"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Select
              label="State"
              options={states}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="ZIP / Postal Code"
              value={form.zip}
              onChange={(e) => setForm({ ...form, zip: e.target.value })}
            />
            <Select
              label="Country"
              options={countries}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
          </div>

          <div className="pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-500 mb-2">Coordinates (auto-detected)</p>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Latitude"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
              <Input
                label="Longitude"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Map Preview */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Map Preview</h2>
          <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center relative">
            <div className="absolute inset-0 bg-gray-200 rounded-lg" />
            <div className="relative z-10 text-center">
              <MapPin className="w-12 h-12 text-purple-600 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Map preview</p>
              <p className="text-xs text-gray-400 mt-1">Drag pin to adjust location</p>
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 text-center">
            {form.street}, {form.city}, {form.state} {form.zip}
          </p>
        </div>
      </div>
    </div>
  );
}
