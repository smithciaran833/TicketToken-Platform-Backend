import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, Image } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

export default function BrandingLogo() {
  const toast = useToast();

  const [colors, setColors] = useState({
    primary: "#9333ea",
    secondary: "#3b82f6",
    accent: "#f59e0b",
  });

  const handleSave = () => {
    toast.success("Branding saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Logo & Colors</h1>
            <p className="text-gray-500">Customize your brand identity</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Logo Upload */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Logo</h2>
          
          <div className="mb-4">
            <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Image className="w-12 h-12 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500 text-center mb-4">Current logo</p>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600 mb-1">Upload new logo</p>
            <p className="text-xs text-gray-400">PNG, JPG or SVG. Max 2MB.</p>
            <p className="text-xs text-gray-400">Recommended: 400x400px</p>
          </div>
        </div>

        {/* Color Settings */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Colors</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Primary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colors.primary}
                  onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-300"
                />
                <input
                  type="text"
                  value={colors.primary}
                  onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Used for buttons, links, and highlights</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Secondary Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colors.secondary}
                  onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-300"
                />
                <input
                  type="text"
                  value={colors.secondary}
                  onChange={(e) => setColors({ ...colors, secondary: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Used for secondary actions and accents</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Accent Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={colors.accent}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  className="w-12 h-12 rounded-lg cursor-pointer border border-gray-300"
                />
                <input
                  type="text"
                  value={colors.accent}
                  onChange={(e) => setColors({ ...colors, accent: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Used for alerts and special highlights</p>
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
        
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center gap-4 mb-6">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: colors.primary }}
            >
              GT
            </div>
            <span className="text-xl font-bold">Grand Theater</span>
          </div>

          <div className="flex gap-3 mb-4">
            <button 
              className="px-4 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: colors.primary }}
            >
              Primary Button
            </button>
            <button 
              className="px-4 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: colors.secondary }}
            >
              Secondary Button
            </button>
            <button 
              className="px-4 py-2 rounded-lg text-white font-medium"
              style={{ backgroundColor: colors.accent }}
            >
              Accent Button
            </button>
          </div>

          <p className="text-gray-600">
            This is sample text with a <span style={{ color: colors.primary }} className="font-medium">primary link</span> and 
            a <span style={{ color: colors.secondary }} className="font-medium">secondary link</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
