import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, Wrench, MoreVertical, CheckCircle, AlertTriangle, XCircle, ClipboardCheck } from "lucide-react";
import { Button, Dropdown } from "../../components/ui";

const equipment = [
  { id: 1, name: "Main PA System", category: "Audio", location: "Main Stage", status: "working", lastCheck: "2025-01-10" },
  { id: 2, name: "Backup Speakers", category: "Audio", location: "Storage", status: "working", lastCheck: "2025-01-10" },
  { id: 3, name: "LED Wall Panel A", category: "Visual", location: "Main Stage", status: "working", lastCheck: "2025-01-08" },
  { id: 4, name: "Spotlight #1", category: "Lighting", location: "Rigging A", status: "needs_repair", lastCheck: "2025-01-05" },
  { id: 5, name: "Emergency Exit Light #3", category: "Safety", location: "Exit C", status: "out_of_service", lastCheck: "2025-01-12" },
  { id: 6, name: "Folding Tables (50)", category: "Furniture", location: "Storage Room B", status: "working", lastCheck: "2025-01-01" },
  { id: 7, name: "Barricades (20)", category: "Safety", location: "Loading Dock", status: "working", lastCheck: "2025-01-03" },
  { id: 8, name: "Wireless Microphones", category: "Audio", location: "Sound Booth", status: "working", lastCheck: "2025-01-10" },
];

const categoryOptions = [
  { value: "all", label: "All Categories" },
  { value: "audio", label: "Audio" },
  { value: "visual", label: "Visual" },
  { value: "lighting", label: "Lighting" },
  { value: "safety", label: "Safety" },
  { value: "furniture", label: "Furniture" },
  { value: "other", label: "Other" },
];

const statusOptions = [
  { value: "all", label: "All Status" },
  { value: "working", label: "Working" },
  { value: "needs_repair", label: "Needs Repair" },
  { value: "out_of_service", label: "Out of Service" },
];

export default function EquipmentList() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "working": return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "needs_repair": return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case "out_of_service": return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "working": return "bg-green-100 text-green-700";
      case "needs_repair": return "bg-yellow-100 text-yellow-700";
      case "out_of_service": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getDropdownItems = () => [
    { label: "Run Check", icon: <ClipboardCheck className="w-4 h-4" />, onClick: () => {} },
    { label: "Report Issue", icon: <AlertTriangle className="w-4 h-4" />, onClick: () => {} },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/operations" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Equipment</h1>
            <p className="text-gray-500">Manage venue equipment inventory</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/venue/operations/equipment/check">
            <Button variant="secondary">
              <ClipboardCheck className="w-4 h-4" />
              Run Check
            </Button>
          </Link>
          <Link to="/venue/operations/equipment/new">
            <Button>
              <Plus className="w-4 h-4" />
              Add Equipment
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Equipment</p>
          <p className="text-2xl font-bold text-gray-900">47</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Working</p>
          <p className="text-2xl font-bold text-green-600">44</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Needs Repair</p>
          <p className="text-2xl font-bold text-yellow-600">2</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Out of Service</p>
          <p className="text-2xl font-bold text-red-600">1</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search equipment..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {categoryOptions.map(opt => (
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

      {/* Equipment Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Check</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {equipment.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Wrench className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{item.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.category}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.location}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(item.status)}`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{item.lastCheck}</td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
