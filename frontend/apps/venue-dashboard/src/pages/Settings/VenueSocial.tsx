import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Facebook, Instagram, Twitter, Youtube, Globe } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function VenueSocial() {
  const toast = useToast();
  const [form, setForm] = useState({
    facebook: "https://facebook.com/grandtheater",
    instagram: "https://instagram.com/grandtheater",
    twitter: "https://twitter.com/grandtheater",
    tiktok: "",
    youtube: "https://youtube.com/grandtheater",
    website: "https://grandtheater.com",
  });

  const handleSave = () => {
    toast.success("Social links saved!");
  };

  return (
    <div className="max-w-2xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Social Links</h1>
            <p className="text-gray-500">Connect your social accounts</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Facebook className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <Input
              label="Facebook"
              placeholder="https://facebook.com/yourvenue"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
            <Instagram className="w-5 h-5 text-pink-600" />
          </div>
          <div className="flex-1">
            <Input
              label="Instagram"
              placeholder="https://instagram.com/yourvenue"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center">
            <Twitter className="w-5 h-5 text-sky-500" />
          </div>
          <div className="flex-1">
            <Input
              label="Twitter / X"
              placeholder="https://twitter.com/yourvenue"
              value={form.twitter}
              onChange={(e) => setForm({ ...form, twitter: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
            </svg>
          </div>
          <div className="flex-1">
            <Input
              label="TikTok"
              placeholder="https://tiktok.com/@yourvenue"
              value={form.tiktok}
              onChange={(e) => setForm({ ...form, tiktok: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Youtube className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <Input
              label="YouTube"
              placeholder="https://youtube.com/yourvenue"
              value={form.youtube}
              onChange={(e) => setForm({ ...form, youtube: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1">
            <Input
              label="Website"
              placeholder="https://yourvenue.com"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-medium text-gray-700 mb-4">Preview</h3>
        <div className="flex items-center gap-3">
          {form.facebook && (
            <a href={form.facebook} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow transition-shadow">
              <Facebook className="w-5 h-5 text-blue-600" />
            </a>
          )}
          {form.instagram && (
            <a href={form.instagram} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow transition-shadow">
              <Instagram className="w-5 h-5 text-pink-600" />
            </a>
          )}
          {form.twitter && (
            <a href={form.twitter} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow transition-shadow">
              <Twitter className="w-5 h-5 text-sky-500" />
            </a>
          )}
          {form.youtube && (
            <a href={form.youtube} target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm hover:shadow transition-shadow">
              <Youtube className="w-5 h-5 text-red-600" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
