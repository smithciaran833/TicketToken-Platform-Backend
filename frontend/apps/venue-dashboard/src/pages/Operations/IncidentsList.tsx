import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, Download, AlertTriangle } from "lucide-react";
import { Button } from "../../components/ui";

const incidents = [
  { id: 1, date: "2025-01-15 8:30 PM", event: "Summer Music Festival", type: "Medical", description: "Attendee fainted near stage", severity: "high", status: "open" },
  { id: 2, date: "2025-01-14 10:15 PM", event: "Jazz Night", type: "Security", description: "Unauthorized entry attempt at VIP", severity: "medium", status: "resolved" },
  { id: 3, date: "2025-01-13 9:00 PM", event: "Comedy Show", type: "Customer Complaint", description: "Sound quality issues reported", severity: "low", status: "open" },
  { id: 4, date: "2025-01-12 7:45 PM", event: "Tech Conference", type: "Damage/Property", description: "Broken chair in section B", severity: "low", status: "resolved" },
  { id: 5, date: "2025-01-10 11:00 PM", event: "Rock Concert", type: "Medical", description: "Minor injury in mosh pit", severity: "medium", status: "resolved" },
];

const eventOptions = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Jazz Night" },
  { value: "3", label: "Comedy Show" },
];

const typeOptions = [
  { value: "all", label: "All Types" },
  { value: "medical", label: "Medical" },
  { value: "security", label: "Security" },
  { value: "damage", label: "Damage/Property" },
  { value: "complaint", label: "Customer Complaint" },
  { value: "staff", label: "Staff Issue" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
];

export default function IncidentsList() {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");


  const getSeverityBadge = (severity: string) => {
    const styles = {
      high: "bg-red-100 text-red-700",
      medium: "bg-yellow-100 text-yellow-700",
      low: "bg-gray-100 text-gray-700",
      critical: "bg-red-600 text-white",
    };
    return styles[severity as keyof typeof styles] || styles.low;
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/operations" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Incidents</h1>
            <p className="text-gray-500">Track and manage venue incidents</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Link to="/venue/operations/incidents/new">
            <Button>
              <Plus className="w-4 h-4" />
              Log Incident
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search incidents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {eventOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {typeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {statusOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Severity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {incidents.map((incident) => (
              <tr key={incident.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">{incident.date}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{incident.event}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 ${
                      incident.type === "Medical" ? "text-red-500" :
                      incident.type === "Security" ? "text-yellow-500" :
                      "text-gray-400"
                    }`} />
                    <span className="text-sm text-gray-900">{incident.type}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{incident.description}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityBadge(incident.severity)}`}>
                    {incident.severity}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    incident.status === "open" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                  }`}>
                    {incident.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Link to={`/venue/operations/incidents/${incident.id}`}>
                    <Button variant="secondary" size="sm">View</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
