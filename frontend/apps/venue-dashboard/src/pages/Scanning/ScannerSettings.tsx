import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Smartphone, Trash2, Edit, Wifi, WifiOff } from "lucide-react";
import { Button, Modal, ModalFooter, Input, Select, Toggle, useToast, ToastContainer } from "../../components/ui";

const entryPoints = [
  { id: 1, name: "Main Gate", type: "main", devices: ["Device A1", "Device A2", "Device A3"] },
  { id: 2, name: "VIP Entrance", type: "vip", devices: ["Device V1", "Device V2"] },
  { id: 3, name: "Will Call", type: "willcall", devices: ["Device W1"] },
];

const registeredDevices = [
  { id: "A1", name: "Device A1", entryPoint: "Main Gate", lastSeen: "2 min ago", status: "online" },
  { id: "A2", name: "Device A2", entryPoint: "Main Gate", lastSeen: "5 min ago", status: "online" },
  { id: "A3", name: "Device A3", entryPoint: "Main Gate", lastSeen: "1 hour ago", status: "offline" },
  { id: "V1", name: "Device V1", entryPoint: "VIP Entrance", lastSeen: "Just now", status: "online" },
  { id: "V2", name: "Device V2", entryPoint: "VIP Entrance", lastSeen: "30 min ago", status: "online" },
  { id: "W1", name: "Device W1", entryPoint: "Will Call", lastSeen: "10 min ago", status: "online" },
];

const entryPointTypes = [
  { value: "main", label: "Main Entry" },
  { value: "vip", label: "VIP" },
  { value: "willcall", label: "Will Call" },
  { value: "accessible", label: "Accessible Entry" },
  { value: "staff", label: "Staff Only" },
];

export default function ScannerSettings() {
  const toast = useToast();
  
  const [settings, setSettings] = useState({
    allowReEntry: true,
    reEntryWindow: 60, // minutes
    requireManagerOverride: true,
    offlineModeEnabled: true,
    soundOnScan: true,
    vibrateOnScan: true,
  });

  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryForm, setEntryForm] = useState({ name: "", type: "main" });

  const handleSaveSettings = () => {
    toast.success("Settings saved!");
  };

  const handleAddEntry = () => {
    toast.success(`Entry point "${entryForm.name}" added!`);
    setShowEntryModal(false);
    setEntryForm({ name: "", type: "main" });
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/scanning" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scanner Settings</h1>
          <p className="text-gray-500">Configure entry points and scanner behavior</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Entry Points */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Entry Points</h2>
            <Button variant="secondary" onClick={() => setShowEntryModal(true)}>
              <Plus className="w-4 h-4" />
              Add Entry Point
            </Button>
          </div>
          <div className="space-y-3">
            {entryPoints.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{entry.name}</p>
                  <p className="text-sm text-gray-500">
                    {entryPointTypes.find(t => t.value === entry.type)?.label} • {entry.devices.length} device{entry.devices.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="p-2 text-gray-400 hover:text-gray-600">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Registered Devices */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Registered Devices</h2>
          <div className="space-y-3">
            {registeredDevices.map((device) => (
              <div key={device.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${device.status === "online" ? "bg-green-100" : "bg-gray-100"}`}>
                    <Smartphone className={`w-4 h-4 ${device.status === "online" ? "text-green-600" : "text-gray-400"}`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{device.name}</p>
                    <p className="text-xs text-gray-500">{device.entryPoint}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {device.status === "online" ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="text-xs text-gray-500">{device.lastSeen}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scanner Behavior */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Scanner Behavior</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Allow Re-Entry</p>
                <p className="text-sm text-gray-500">Let guests leave and return</p>
              </div>
              <Toggle
                enabled={settings.allowReEntry}
                onChange={(val) => setSettings({ ...settings, allowReEntry: val })}
              />
            </div>

            {settings.allowReEntry && (
              <div className="pl-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Re-entry Window (minutes)</label>
                <input
                  type="number"
                  min="15"
                  max="180"
                  value={settings.reEntryWindow}
                  onChange={(e) => setSettings({ ...settings, reEntryWindow: parseInt(e.target.value) })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            )}

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Require Manager Override</p>
                <p className="text-sm text-gray-500">PIN required for manual overrides</p>
              </div>
              <Toggle
                enabled={settings.requireManagerOverride}
                onChange={(val) => setSettings({ ...settings, requireManagerOverride: val })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Offline Mode</p>
                <p className="text-sm text-gray-500">Cache tickets for offline scanning</p>
              </div>
              <Toggle
                enabled={settings.offlineModeEnabled}
                onChange={(val) => setSettings({ ...settings, offlineModeEnabled: val })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Sound on Scan</p>
                <p className="text-sm text-gray-500">Play audio feedback</p>
              </div>
              <Toggle
                enabled={settings.soundOnScan}
                onChange={(val) => setSettings({ ...settings, soundOnScan: val })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Vibrate on Scan</p>
                <p className="text-sm text-gray-500">Haptic feedback on mobile</p>
              </div>
              <Toggle
                enabled={settings.vibrateOnScan}
                onChange={(val) => setSettings({ ...settings, vibrateOnScan: val })}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t">
          <Button onClick={handleSaveSettings}>Save Settings</Button>
        </div>
      </div>

      {/* Add Entry Point Modal */}
      <Modal
        isOpen={showEntryModal}
        onClose={() => setShowEntryModal(false)}
        title="Add Entry Point"
      >
        <div className="space-y-4">
          <Input
            label="Entry Point Name"
            value={entryForm.name}
            onChange={(e) => setEntryForm({ ...entryForm, name: e.target.value })}
            placeholder="e.g. North Gate"
          />
          <Select
            label="Entry Type"
            options={entryPointTypes}
            value={entryForm.type}
            onChange={(e) => setEntryForm({ ...entryForm, type: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowEntryModal(false)}>Cancel</Button>
          <Button onClick={handleAddEntry}>Add Entry Point</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
