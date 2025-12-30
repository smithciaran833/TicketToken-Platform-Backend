import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Briefcase, Plus, X } from "lucide-react";
import { Button, Input, Textarea, Toggle, useToast, ToastContainer } from "../../components/ui";

export default function PolicyBags() {
  const toast = useToast();

  const [form, setForm] = useState({
    bagsAllowed: true,
    maxSize: "12x12x6",
    clearBagsRequired: false,
    lockerAvailable: true,
    lockerPrice: "10",
    prohibitedItems: [
      "Weapons of any kind",
      "Outside food and beverages",
      "Professional cameras",
      "Drones",
      "Laser pointers",
      "Illegal substances",
    ],
    policyText: "Small bags under 12\"x12\"x6\" are permitted. All bags are subject to search at entry. Lockers are available for $10 to store prohibited items. Clear bags are recommended for faster entry.",
  });

  const [newItem, setNewItem] = useState("");

  const addProhibitedItem = () => {
    if (!newItem.trim()) return;
    setForm({ ...form, prohibitedItems: [...form.prohibitedItems, newItem.trim()] });
    setNewItem("");
  };

  const removeProhibitedItem = (index: number) => {
    setForm({ ...form, prohibitedItems: form.prohibitedItems.filter((_, i) => i !== index) });
  };

  const handleSave = () => {
    toast.success("Bag policy saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Bag Policy</h1>
            <p className="text-gray-500">Set bag and prohibited items rules</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Bag Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-orange-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Bag Rules</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Bags Allowed</p>
              <p className="text-sm text-gray-500">Guests may bring bags into the venue</p>
            </div>
            <Toggle
              enabled={form.bagsAllowed}
              onChange={(val) => setForm({ ...form, bagsAllowed: val })}
            />
          </div>

          {form.bagsAllowed && (
            <>
              <Input
                label="Maximum Bag Size"
                placeholder="e.g. 12x12x6 inches"
                value={form.maxSize}
                onChange={(e) => setForm({ ...form, maxSize: e.target.value })}
              />

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Clear Bags Required</p>
                  <p className="text-sm text-gray-500">Only transparent bags allowed</p>
                </div>
                <Toggle
                  enabled={form.clearBagsRequired}
                  onChange={(val) => setForm({ ...form, clearBagsRequired: val })}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lockers */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Lockers</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Lockers Available</p>
              <p className="text-sm text-gray-500">Offer lockers for guests to store items</p>
            </div>
            <Toggle
              enabled={form.lockerAvailable}
              onChange={(val) => setForm({ ...form, lockerAvailable: val })}
            />
          </div>

          {form.lockerAvailable && (
            <Input
              label="Locker Price ($)"
              type="number"
              min="0"
              value={form.lockerPrice}
              onChange={(e) => setForm({ ...form, lockerPrice: e.target.value })}
            />
          )}
        </div>
      </div>

      {/* Prohibited Items */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Prohibited Items</h2>

        <div className="flex gap-2 mb-4">
          <Input
            label=""
            placeholder="Add prohibited item..."
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && addProhibitedItem()}
          />
          <Button variant="secondary" onClick={addProhibitedItem}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {form.prohibitedItems.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm"
            >
              {item}
              <button
                onClick={() => removeProhibitedItem(index)}
                className="hover:text-red-900"
              >
                <X className="w-4 h-4" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Policy Text */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Policy Text</h2>
        <Textarea
          label="Displayed to customers"
          value={form.policyText}
          onChange={(e) => setForm({ ...form, policyText: e.target.value })}
          rows={4}
        />
      </div>
    </div>
  );
}
