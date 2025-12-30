import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, FileText, Map, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button, Textarea, useToast, ToastContainer } from "../../components/ui";

const evacuationRoutes = [
  { id: 1, name: "Main Exit Route", description: "Through main lobby to front entrance", capacity: "1000" },
  { id: 2, name: "East Exit Route", description: "Through east corridor to parking lot", capacity: "500" },
  { id: 3, name: "West Exit Route", description: "Through backstage area to loading dock", capacity: "300" },
  { id: 4, name: "Emergency Exit Route", description: "Fire exits on each floor", capacity: "700" },
];

const assemblyPoints = [
  { id: 1, name: "Front Parking Lot", description: "Primary assembly point", location: "100ft from main entrance" },
  { id: 2, name: "Rear Service Area", description: "Secondary assembly point", location: "Behind loading dock" },
];

export default function SafetyEvacuation() {
  const toast = useToast();
  const [routes] = useState(evacuationRoutes);
  const [points] = useState(assemblyPoints);

  const [procedures, setProcedures] = useState(
    "1. Upon evacuation alarm, all staff should direct guests to nearest exit.\n2. Security team sweeps all areas including restrooms.\n3. Guests assemble at designated points for headcount.\n4. No one re-enters until all-clear is given by Fire Marshal."
  );

  const handleSave = () => {
    toast.success("Evacuation plan saved!");
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
            <h1 className="text-3xl font-bold text-gray-900">Evacuation Plan</h1>
            <p className="text-gray-500">Emergency evacuation procedures</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Evacuation Map Upload */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Map className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Evacuation Map</h2>
        </div>

        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg mb-4">
          <FileText className="w-8 h-8 text-gray-400" />
          <div className="flex-1">
            <p className="font-medium text-gray-900">evacuation_map_2024.pdf</p>
            <p className="text-sm text-gray-500">Uploaded Dec 1, 2024</p>
          </div>
          <Button variant="secondary" size="sm">View</Button>
          <Button variant="secondary" size="sm">Replace</Button>
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Upload evacuation floor plan</p>
          <p className="text-xs text-gray-400 mt-1">PDF or image file up to 25MB</p>
        </div>
      </div>

      {/* Evacuation Routes */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Evacuation Routes</h2>
          <Button variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
            Add Route
          </Button>
        </div>

        <div className="space-y-3">
          {routes.map((route) => (
            <div key={route.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{route.name}</p>
                <p className="text-sm text-gray-500">{route.description}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">Capacity: {route.capacity}</span>
                <button className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Assembly Points */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Assembly Points</h2>
          <Button variant="secondary" size="sm">
            <Plus className="w-4 h-4" />
            Add Point
          </Button>
        </div>

        <div className="space-y-3">
          {points.map((point) => (
            <div key={point.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium text-gray-900">{point.name}</p>
                <p className="text-sm text-gray-500">{point.description} • {point.location}</p>
              </div>
              <button className="text-gray-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Procedures */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Evacuation Procedures</h2>
        <Textarea
          label=""
          placeholder="Step-by-step evacuation procedures..."
          value={procedures}
          onChange={(e) => setProcedures(e.target.value)}
          rows={6}
        />
      </div>

      {/* Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium">Important</p>
            <p className="mt-1">
              Ensure all staff are trained on evacuation procedures. Conduct regular drills 
              and update this plan whenever venue layout changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
