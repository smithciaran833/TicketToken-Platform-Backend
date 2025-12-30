
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, MapPin } from "lucide-react";
import { Button } from "../../components/ui";

const zones = [
  { id: 1, name: "Main Floor", capacity: 800, current: 736, status: "warning" },
  { id: 2, name: "VIP Section", capacity: 150, current: 98, status: "normal" },
  { id: 3, name: "Balcony", capacity: 300, current: 187, status: "normal" },
  { id: 4, name: "Bar Area", capacity: 100, current: 45, status: "normal" },
  { id: 5, name: "Outdoor Patio", capacity: 200, current: 34, status: "normal" },
];

function getStatusColor(_status: string, percentage: number) {
  if (percentage >= 95) return { bg: "bg-red-500", text: "text-red-700", badge: "bg-red-100 text-red-700" };
  if (percentage >= 80) return { bg: "bg-yellow-500", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-700" };
  return { bg: "bg-green-500", text: "text-green-700", badge: "bg-green-100 text-green-700" };
}

function getStatusLabel(percentage: number) {
  if (percentage >= 95) return "Critical";
  if (percentage >= 80) return "Warning";
  return "Normal";
}

export default function ZoneOccupancy() {
  const totalCapacity = zones.reduce((sum, z) => sum + z.capacity, 0);
  const totalCurrent = zones.reduce((sum, z) => sum + z.current, 0);
  const overallPercentage = Math.round((totalCurrent / totalCapacity) * 100);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/scanning" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Zone Occupancy</h1>
            <p className="text-gray-500">Monitor capacity across all zones</p>
          </div>
        </div>
        <Link to="/venue/scanning/alerts">
          <Button variant="secondary">
            <AlertTriangle className="w-4 h-4" />
            Manage Alerts
          </Button>
        </Link>
      </div>

      {/* Overall Stats */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Overall Venue Capacity</h2>
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor("", overallPercentage).badge}`}>
            {getStatusLabel(overallPercentage)}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl font-bold text-gray-900">{totalCurrent.toLocaleString()}</span>
              <span className="text-gray-500">of {totalCapacity.toLocaleString()} capacity</span>
            </div>
            <div className="w-full h-4 bg-gray-200 rounded-full">
              <div 
                className={`h-4 rounded-full transition-all ${getStatusColor("", overallPercentage).bg}`}
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
          </div>
          <div className="text-center px-6 border-l border-gray-200">
            <p className="text-4xl font-bold text-gray-900">{overallPercentage}%</p>
            <p className="text-sm text-gray-500">occupied</p>
          </div>
        </div>
      </div>

      {/* Zone Cards */}
      <div className="grid grid-cols-2 gap-4">
        {zones.map((zone) => {
          const percentage = Math.round((zone.current / zone.capacity) * 100);
          const colors = getStatusColor(zone.status, percentage);
          
          return (
            <div key={zone.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.badge}`}>
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{zone.name}</h3>
                    <p className="text-sm text-gray-500">Capacity: {zone.capacity}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors.badge}`}>
                  {getStatusLabel(percentage)}
                </span>
              </div>
              
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-2xl font-bold text-gray-900">{zone.current}</span>
                  <span className={`text-lg font-semibold ${colors.text}`}>{percentage}%</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full">
                  <div 
                    className={`h-3 rounded-full transition-all ${colors.bg}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Available spots</span>
                <span className="font-medium text-gray-900">{zone.capacity - zone.current}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
