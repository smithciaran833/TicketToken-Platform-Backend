import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Download, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Button } from "../../components/ui";

const mockScans = [
  { id: 1, time: "6:45 PM", date: "Today", attendee: "John Smith", email: "john@email.com", ticketType: "General Admission", entryPoint: "Main Gate", scannedBy: "Device A1", result: "valid" },
  { id: 2, time: "6:44 PM", date: "Today", attendee: "Sarah Johnson", email: "sarah@email.com", ticketType: "VIP Access", entryPoint: "VIP Entrance", scannedBy: "Device V1", result: "valid" },
  { id: 3, time: "6:43 PM", date: "Today", attendee: "Unknown", email: "-", ticketType: "-", entryPoint: "Main Gate", scannedBy: "Device A2", result: "invalid", reason: "Ticket not found" },
  { id: 4, time: "6:42 PM", date: "Today", attendee: "Mike Chen", email: "mike@email.com", ticketType: "General Admission", entryPoint: "Will Call", scannedBy: "Device W1", result: "valid" },
  { id: 5, time: "6:40 PM", date: "Today", attendee: "Emily Davis", email: "emily@email.com", ticketType: "VIP Access", entryPoint: "VIP Entrance", scannedBy: "Device V1", result: "already-scanned", reason: "Scanned at 6:15 PM" },
  { id: 6, time: "6:38 PM", date: "Today", attendee: "Alex Wilson", email: "alex@email.com", ticketType: "General Admission", entryPoint: "Main Gate", scannedBy: "Device A1", result: "valid" },
  { id: 7, time: "6:35 PM", date: "Today", attendee: "Lisa Brown", email: "lisa@email.com", ticketType: "General Admission", entryPoint: "Main Gate", scannedBy: "Device A3", result: "override", reason: "Manager approval - ticket issue" },
  { id: 8, time: "6:33 PM", date: "Today", attendee: "Tom Harris", email: "tom@email.com", ticketType: "VIP Access", entryPoint: "Main Gate", scannedBy: "Device A2", result: "wrong-entry", reason: "Should use VIP Entrance" },
];

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "5", label: "Jazz Night" },
];

const entryPoints = [
  { value: "all", label: "All Entry Points" },
  { value: "main", label: "Main Gate" },
  { value: "vip", label: "VIP Entrance" },
  { value: "willcall", label: "Will Call" },
];

const results = [
  { value: "all", label: "All Results" },
  { value: "valid", label: "Valid" },
  { value: "invalid", label: "Invalid" },
  { value: "already-scanned", label: "Already Scanned" },
  { value: "override", label: "Override" },
];

function getResultBadge(result: string) {
  switch (result) {
    case "valid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
          <CheckCircle className="w-3 h-3" /> Valid
        </span>
      );
    case "invalid":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
          <XCircle className="w-3 h-3" /> Invalid
        </span>
      );
    case "already-scanned":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
          <AlertCircle className="w-3 h-3" /> Already Scanned
        </span>
      );
    case "override":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
          <CheckCircle className="w-3 h-3" /> Override
        </span>
      );
    case "wrong-entry":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
          <AlertCircle className="w-3 h-3" /> Wrong Entry
        </span>
      );
    default:
      return null;
  }
}

export default function ScanHistory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [entryFilter, setEntryFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");

  const filteredScans = mockScans.filter(scan => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!scan.attendee.toLowerCase().includes(query) && !scan.email.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (resultFilter !== "all" && scan.result !== resultFilter) return false;
    return true;
  });

  const handleExport = () => {
    alert("Exporting scan history...");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/scanning" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Scan History</h1>
            <p className="text-gray-500">View and export all scan records</p>
          </div>
        </div>
        <Button variant="secondary" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {events.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <select
            value={entryFilter}
            onChange={(e) => setEntryFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {entryPoints.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {results.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Scans</p>
          <p className="text-2xl font-bold text-gray-900">{mockScans.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Valid</p>
          <p className="text-2xl font-bold text-green-600">{mockScans.filter(s => s.result === "valid").length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Invalid</p>
          <p className="text-2xl font-bold text-red-600">{mockScans.filter(s => s.result === "invalid").length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Overrides</p>
          <p className="text-2xl font-bold text-purple-600">{mockScans.filter(s => s.result === "override").length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry Point</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredScans.map((scan) => (
              <tr key={scan.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{scan.time}</p>
                  <p className="text-xs text-gray-500">{scan.date}</p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{scan.attendee}</p>
                  <p className="text-xs text-gray-500">{scan.email}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{scan.ticketType}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{scan.entryPoint}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{scan.scannedBy}</td>
                <td className="px-6 py-4">
                  {getResultBadge(scan.result)}
                  {scan.reason && <p className="text-xs text-gray-500 mt-1">{scan.reason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
