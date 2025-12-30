
import { Link } from "react-router-dom";
import { AlertTriangle, Wrench, Plus, ChevronRight, ClipboardCheck } from "lucide-react";
import { Button } from "../../components/ui";

const recentIncidents = [
  { id: 1, type: "Medical", event: "Summer Music Festival", severity: "high", status: "open", date: "2025-01-15" },
  { id: 2, type: "Security", event: "Jazz Night", severity: "medium", status: "resolved", date: "2025-01-14" },
  { id: 3, type: "Customer Complaint", event: "Comedy Show", severity: "low", status: "open", date: "2025-01-13" },
];

const equipmentAlerts = [
  { id: 1, name: "Main PA System", issue: "Needs calibration", priority: "medium" },
  { id: 2, name: "Emergency Exit Light #3", issue: "Not working", priority: "high" },
];

export default function OperationsIndex() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Operations</h1>
          <p className="text-gray-500">Manage incidents and equipment</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Open Incidents</p>
              <p className="text-3xl font-bold text-red-600">3</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Resolved This Month</p>
              <p className="text-3xl font-bold text-green-600">12</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Equipment Items</p>
              <p className="text-3xl font-bold text-gray-900">47</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Wrench className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Needs Attention</p>
              <p className="text-3xl font-bold text-yellow-600">2</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Wrench className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Link to="/venue/operations/incidents" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Incidents</h3>
                <p className="text-sm text-gray-500">Log and track incidents</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/operations/equipment" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Wrench className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Equipment</h3>
                <p className="text-sm text-gray-500">Manage venue equipment</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Incidents */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Incidents</h2>
            <Link to="/venue/operations/incidents/new">
              <Button size="sm">
                <Plus className="w-4 h-4" />
                Log Incident
              </Button>
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentIncidents.map((incident) => (
              <Link key={incident.id} to={`/venue/operations/incidents/${incident.id}`} className="block px-6 py-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{incident.type}</span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        incident.severity === "high" ? "bg-red-100 text-red-700" :
                        incident.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {incident.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{incident.event} • {incident.date}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    incident.status === "open" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {incident.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="px-6 py-3 border-t border-gray-200">
            <Link to="/venue/operations/incidents" className="text-sm text-purple-600 hover:text-purple-700">
              View all incidents →
            </Link>
          </div>
        </div>

        {/* Equipment Alerts */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Equipment Alerts</h2>
            <Link to="/venue/operations/equipment/check">
              <Button size="sm" variant="secondary">
                <ClipboardCheck className="w-4 h-4" />
                Run Check
              </Button>
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {equipmentAlerts.length > 0 ? equipmentAlerts.map((alert) => (
              <div key={alert.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{alert.name}</p>
                    <p className="text-sm text-gray-500">{alert.issue}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    alert.priority === "high" ? "bg-red-100 text-red-700" :
                    alert.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-700"
                  }`}>
                    {alert.priority}
                  </span>
                </div>
              </div>
            )) : (
              <div className="px-6 py-8 text-center text-gray-500">
                All equipment operational
              </div>
            )}
          </div>
          <div className="px-6 py-3 border-t border-gray-200">
            <Link to="/venue/operations/equipment" className="text-sm text-purple-600 hover:text-purple-700">
              View all equipment →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
