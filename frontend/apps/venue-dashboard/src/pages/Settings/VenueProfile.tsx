import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Camera, Share2, Eye } from "lucide-react";
import { Button, Input, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const venueTypes = [
  { value: "concert-hall", label: "Concert Hall" },
  { value: "theater", label: "Theater" },
  { value: "arena", label: "Arena" },
  { value: "club", label: "Club / Nightclub" },
  { value: "outdoor", label: "Outdoor Venue" },
  { value: "stadium", label: "Stadium" },
  { value: "bar", label: "Bar / Lounge" },
  { value: "restaurant", label: "Restaurant" },
  { value: "other", label: "Other" },
];

export default function VenueProfile() {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "The Grand Theater",
    type: "theater",
    description: "The Grand Theater is a historic 2,500-seat venue located in the heart of downtown. Built in 1920, it has hosted countless legendary performances and continues to be the premier destination for live entertainment in the region.\n\nOur state-of-the-art sound system and intimate atmosphere create an unforgettable experience for every guest.",
    shortDescription: "Historic downtown theater hosting world-class live entertainment since 1920.",
    website: "https://grandtheater.com",
  });

  const completeness = 85;

  const handleSave = () => {
    toast.success("Venue profile saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Venue Profile</h1>
            <p className="text-gray-500">Basic venue information</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Completeness */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Profile Completeness</span>
          <span className="text-sm font-medium text-purple-600">{completeness}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-purple-600 h-2 rounded-full" style={{ width: `${completeness}%` }} />
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <Input
          label="Venue Name"
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
          label="Full Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={6}
          helper="Displayed on your venue page. Supports basic formatting."
        />

        <Input
          label="Short Description"
          value={form.shortDescription}
          onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
          helper="Used in search results and previews (max 160 characters)"
        />

        <Input
          label="Website URL"
          type="url"
          value={form.website}
          onChange={(e) => setForm({ ...form, website: e.target.value })}
          placeholder="https://"
        />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <Link to="/venue/settings/media" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-900">Edit Photos & Videos</span>
          </div>
        </Link>
        <Link to="/venue/settings/social" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <Share2 className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-900">Edit Social Links</span>
          </div>
        </Link>
        <Link to="/venue/settings/preview" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <Eye className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-900">Preview Public Page</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
