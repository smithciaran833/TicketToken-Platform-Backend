import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function CapacitySettings() {
  const toast = useToast();

  const [form, setForm] = useState({
    totalCapacity: "2500",
    fireMarshalCapacity: "2500",
    defaultEventCapacity: "2000",
    standingCapacity: "3000",
    seatedCapacity: "2500",
  });

  const handleSave = () => {
    toast.success("Capacity settings saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Capacity Settings</h1>
            <p className="text-gray-500">Venue capacity limits</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Main Capacities */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Capacity Limits</h2>
        </div>

        <div className="space-y-4">
          <Input
            label="Total Venue Capacity"
            type="number"
            value={form.totalCapacity}
            onChange={(e) => setForm({ ...form, totalCapacity: e.target.value })}
            helper="Maximum number of people the venue can hold"
          />

          <Input
            label="Fire Marshal Capacity"
            type="number"
            value={form.fireMarshalCapacity}
            onChange={(e) => setForm({ ...form, fireMarshalCapacity: e.target.value })}
            helper="Legal maximum occupancy"
          />

          <Input
            label="Default Event Capacity"
            type="number"
            value={form.defaultEventCapacity}
            onChange={(e) => setForm({ ...form, defaultEventCapacity: e.target.value })}
            helper="Default capacity when creating new events"
          />
        </div>
      </div>

      {/* Configuration Capacities */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Capacity by Configuration</h2>

        <div className="space-y-4">
          <Input
            label="Standing Room Capacity"
            type="number"
            value={form.standingCapacity}
            onChange={(e) => setForm({ ...form, standingCapacity: e.target.value })}
          />

          <Input
            label="Seated Capacity"
            type="number"
            value={form.seatedCapacity}
            onChange={(e) => setForm({ ...form, seatedCapacity: e.target.value })}
          />
        </div>

        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Configure additional seating arrangements in{" "}
            <Link to="/venue/settings/seating/configs" className="text-purple-600 hover:underline">
              Seating Configurations
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
