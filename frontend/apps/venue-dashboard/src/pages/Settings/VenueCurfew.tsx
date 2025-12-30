import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Volume2, Clock } from "lucide-react";
import { Button, Input, Select, Textarea, Toggle, useToast, ToastContainer } from "../../components/ui";

const curfewOptions = [
  { value: "none", label: "No Curfew" },
  { value: "10pm", label: "10:00 PM" },
  { value: "11pm", label: "11:00 PM" },
  { value: "12am", label: "12:00 AM" },
  { value: "1am", label: "1:00 AM" },
  { value: "2am", label: "2:00 AM" },
  { value: "custom", label: "Custom" },
];

export default function VenueCurfew() {
  const toast = useToast();

  const [curfew, setCurfew] = useState({
    type: "11pm",
    customTime: "",
    hardStop: true,
  });

  const [noise, setNoise] = useState({
    hasLimit: true,
    decibelLimit: "95",
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    indoorOutdoorDifference: true,
    outdoorLimit: "85",
  });

  const [ordinances, setOrdinances] = useState(
    "Per city ordinance 12.34.56, outdoor amplified music must cease by 10:00 PM on weeknights and 11:00 PM on weekends. Indoor venues may operate until 2:00 AM with proper soundproofing."
  );

  const handleSave = () => {
    toast.success("Curfew & noise settings saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Curfew & Noise Rules</h1>
            <p className="text-gray-500">Noise restrictions and curfew times</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Curfew */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Curfew Time</h2>
        </div>

        <div className="space-y-4">
          <Select
            label="Curfew"
            options={curfewOptions}
            value={curfew.type}
            onChange={(e) => setCurfew({ ...curfew, type: e.target.value })}
          />

          {curfew.type === "custom" && (
            <Input
              label="Custom Curfew Time"
              type="time"
              value={curfew.customTime}
              onChange={(e) => setCurfew({ ...curfew, customTime: e.target.value })}
            />
          )}

          {curfew.type !== "none" && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">Hard Stop</p>
                <p className="text-sm text-gray-500">All sound must stop at curfew time</p>
              </div>
              <Toggle
                enabled={curfew.hardStop}
                onChange={(val) => setCurfew({ ...curfew, hardStop: val })}
              />
            </div>
          )}
        </div>
      </div>

      {/* Noise Restrictions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Noise Restrictions</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Decibel Limit</p>
              <p className="text-sm text-gray-500">Maximum sound level enforced</p>
            </div>
            <Toggle
              enabled={noise.hasLimit}
              onChange={(val) => setNoise({ ...noise, hasLimit: val })}
            />
          </div>

          {noise.hasLimit && (
            <>
              <Input
                label="Maximum Decibels (dB)"
                type="number"
                value={noise.decibelLimit}
                onChange={(e) => setNoise({ ...noise, decibelLimit: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Quiet Hours Start"
                  type="time"
                  value={noise.quietHoursStart}
                  onChange={(e) => setNoise({ ...noise, quietHoursStart: e.target.value })}
                />
                <Input
                  label="Quiet Hours End"
                  type="time"
                  value={noise.quietHoursEnd}
                  onChange={(e) => setNoise({ ...noise, quietHoursEnd: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Different Outdoor Limit</p>
                  <p className="text-sm text-gray-500">Separate limit for outdoor areas</p>
                </div>
                <Toggle
                  enabled={noise.indoorOutdoorDifference}
                  onChange={(val) => setNoise({ ...noise, indoorOutdoorDifference: val })}
                />
              </div>

              {noise.indoorOutdoorDifference && (
                <Input
                  label="Outdoor Maximum (dB)"
                  type="number"
                  value={noise.outdoorLimit}
                  onChange={(e) => setNoise({ ...noise, outdoorLimit: e.target.value })}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Local Ordinances */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Local Ordinances</h2>
        <Textarea
          label=""
          placeholder="Notes about local noise ordinances..."
          value={ordinances}
          onChange={(e) => setOrdinances(e.target.value)}
          rows={4}
        />
      </div>
    </div>
  );
}
