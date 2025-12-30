import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, Music } from "lucide-react";
import { Button, Input, Toggle, useToast, ToastContainer } from "../../components/ui";

export default function RoyaltySettings() {
  const toast = useToast();

  const [settings, setSettings] = useState({
    venueRoyaltyEnabled: true,
    venueRoyaltyPercent: "10",
    artistRoyaltyEnabled: true,
    artistRoyaltyPercent: "5",
  });

  const totalRoyalty = 
    (settings.venueRoyaltyEnabled ? parseFloat(settings.venueRoyaltyPercent) || 0 : 0) +
    (settings.artistRoyaltyEnabled ? parseFloat(settings.artistRoyaltyPercent) || 0 : 0);

  const platformFee = 2.5;
  const sellerReceives = 100 - totalRoyalty - platformFee;

  const handleSave = () => {
    if (totalRoyalty > 25) {
      toast.error("Total royalties cannot exceed 25%");
      return;
    }
    toast.success("Royalty settings saved!");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/resale" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Royalty Settings</h1>
          <p className="text-gray-500">Configure royalties on resale transactions</p>
        </div>
      </div>

      {/* Venue Royalty */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Venue Royalty</h2>
              <p className="text-sm text-gray-500">Percentage you receive on each resale</p>
            </div>
          </div>
          <Toggle
            enabled={settings.venueRoyaltyEnabled}
            onChange={(val) => setSettings({ ...settings, venueRoyaltyEnabled: val })}
          />
        </div>

        {settings.venueRoyaltyEnabled && (
          <div className="mt-4">
            <Input
              label="Royalty Percentage"
              type="number"
              min="0"
              max="20"
              value={settings.venueRoyaltyPercent}
              onChange={(e) => setSettings({ ...settings, venueRoyaltyPercent: e.target.value })}
              helper="Recommended: 5-15%"
            />
          </div>
        )}
      </div>

      {/* Artist Royalty */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-100 rounded-lg flex items-center justify-center">
              <Music className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Artist Royalty</h2>
              <p className="text-sm text-gray-500">Shared with artists on their events</p>
            </div>
          </div>
          <Toggle
            enabled={settings.artistRoyaltyEnabled}
            onChange={(val) => setSettings({ ...settings, artistRoyaltyEnabled: val })}
          />
        </div>

        {settings.artistRoyaltyEnabled && (
          <div className="mt-4">
            <Input
              label="Royalty Percentage"
              type="number"
              min="0"
              max="15"
              value={settings.artistRoyaltyPercent}
              onChange={(e) => setSettings({ ...settings, artistRoyaltyPercent: e.target.value })}
              helper="Distributed to artists based on event configuration"
            />
          </div>
        )}
      </div>

      {/* Payout Preview */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Resale Payout Breakdown</h3>
        <p className="text-sm text-gray-500 mb-4">Example: $100 resale transaction</p>

        <div className="space-y-3">
          {settings.venueRoyaltyEnabled && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Venue Royalty ({settings.venueRoyaltyPercent}%)</span>
              <span className="font-medium text-purple-600">${((parseFloat(settings.venueRoyaltyPercent) || 0)).toFixed(2)}</span>
            </div>
          )}
          {settings.artistRoyaltyEnabled && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Artist Royalty ({settings.artistRoyaltyPercent}%)</span>
              <span className="font-medium text-pink-600">${((parseFloat(settings.artistRoyaltyPercent) || 0)).toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Platform Fee ({platformFee}%)</span>
            <span className="font-medium text-gray-600">${platformFee.toFixed(2)}</span>
          </div>
          <div className="border-t pt-3 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Seller Receives ({sellerReceives.toFixed(1)}%)</span>
            <span className="text-xl font-bold text-green-600">${sellerReceives.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Validation Warning */}
      {totalRoyalty > 25 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">
            <strong>Warning:</strong> Total royalties ({totalRoyalty}%) exceed the maximum allowed (25%). 
            Please reduce the royalty percentages.
          </p>
        </div>
      )}

      {/* Blockchain Info */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-purple-800">
          <strong>Smart Contract Enforcement:</strong> Royalties are automatically collected and distributed 
          via smart contracts. Artists receive their share instantly when tickets are resold.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Royalty Settings</Button>
      </div>
    </div>
  );
}
