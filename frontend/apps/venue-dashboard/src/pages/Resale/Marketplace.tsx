import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Download, Flag, MoreVertical } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const listings = [
  { id: 1, event: "Summer Music Festival", ticketType: "VIP Access", faceValue: 150, listPrice: 200, markup: 33, listedDate: "Jun 25, 2025", seller: "user_a1b2", status: "active" },
  { id: 2, event: "Summer Music Festival", ticketType: "General Admission", faceValue: 65, listPrice: 85, markup: 31, listedDate: "Jun 24, 2025", seller: "user_c3d4", status: "active" },
  { id: 3, event: "Tech Conference", ticketType: "Premium Pass", faceValue: 300, listPrice: 450, markup: 50, listedDate: "Jun 23, 2025", seller: "user_e5f6", status: "active" },
  { id: 4, event: "Jazz Night", ticketType: "VIP Table", faceValue: 100, listPrice: 120, markup: 20, listedDate: "Jun 22, 2025", seller: "user_g7h8", status: "sold" },
  { id: 5, event: "Summer Music Festival", ticketType: "Early Bird", faceValue: 55, listPrice: 75, markup: 36, listedDate: "Jun 21, 2025", seller: "user_i9j0", status: "active" },
];

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
];

const flagReasons = [
  { value: "suspicious-pricing", label: "Suspicious Pricing" },
  { value: "duplicate", label: "Duplicate Listing" },
  { value: "fraudulent", label: "Fraudulent Seller" },
  { value: "policy-violation", label: "Policy Violation" },
  { value: "other", label: "Other" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "active": return "bg-green-100 text-green-700";
    case "sold": return "bg-blue-100 text-blue-700";
    case "flagged": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function Marketplace() {
  const toast = useToast();
  const [eventFilter, setEventFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [selectedListing, setSelectedListing] = useState<typeof listings[0] | null>(null);
  const [flagForm, setFlagForm] = useState({ reason: "suspicious-pricing", notes: "", action: "flag" });

  const activeListings = listings.filter(l => l.status === "active").length;
  const avgMarkup = Math.round(listings.reduce((sum, l) => sum + l.markup, 0) / listings.length);
  const totalVolume = listings.filter(l => l.status === "sold").reduce((sum, l) => sum + l.listPrice, 0);

  const filteredListings = listings.filter(l => {
    if (searchQuery && !l.event.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleFlag = (listing: typeof listings[0]) => {
    setSelectedListing(listing);
    setShowFlagModal(true);
  };

  const submitFlag = () => {
    toast.success("Listing flagged for review");
    setShowFlagModal(false);
    setFlagForm({ reason: "suspicious-pricing", notes: "", action: "flag" });
  };

  const getDropdownItems = (listing: typeof listings[0]) => [
    { label: "View Details", icon: <Search className="w-4 h-4" />, onClick: () => {} },
    { label: "Flag Listing", icon: <Flag className="w-4 h-4" />, onClick: () => handleFlag(listing) },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/resale" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Resale Marketplace</h1>
            <p className="text-gray-500">View and manage active listings</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active Listings</p>
          <p className="text-2xl font-bold text-gray-900">{activeListings}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Avg Markup vs Face Value</p>
          <p className="text-2xl font-bold text-yellow-600">+{avgMarkup}%</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Volume (Sold)</p>
          <p className="text-2xl font-bold text-green-600">${totalVolume.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search listings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {events.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
      </div>

      {/* Listings Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket Type</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Face Value</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">List Price</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Markup</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Listed</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredListings.map((listing) => (
              <tr key={listing.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{listing.event}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{listing.ticketType}</td>
                <td className="px-6 py-4 text-right text-sm text-gray-600">${listing.faceValue}</td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">${listing.listPrice}</td>
                <td className="px-6 py-4 text-right">
                  <span className={`text-sm font-medium ${listing.markup > 40 ? "text-red-600" : listing.markup > 20 ? "text-yellow-600" : "text-green-600"}`}>
                    +{listing.markup}%
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{listing.listedDate}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(listing.status)}`}>
                    {listing.status.charAt(0).toUpperCase() + listing.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(listing)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Flag Modal */}
      <Modal
        isOpen={showFlagModal}
        onClose={() => setShowFlagModal(false)}
        title="Flag Listing"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-medium text-gray-900">{selectedListing?.event}</p>
            <p className="text-sm text-gray-500">{selectedListing?.ticketType} • ${selectedListing?.listPrice}</p>
          </div>

          <Select
            label="Reason"
            options={flagReasons}
            value={flagForm.reason}
            onChange={(e) => setFlagForm({ ...flagForm, reason: e.target.value })}
          />

          <Textarea
            label="Notes"
            placeholder="Additional details..."
            value={flagForm.notes}
            onChange={(e) => setFlagForm({ ...flagForm, notes: e.target.value })}
            rows={3}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="radio" name="action" value="flag" checked={flagForm.action === "flag"} onChange={(e) => setFlagForm({ ...flagForm, action: e.target.value })} className="text-purple-600" />
                <span className="text-sm text-gray-700">Flag for review only</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="action" value="remove" checked={flagForm.action === "remove"} onChange={(e) => setFlagForm({ ...flagForm, action: e.target.value })} className="text-purple-600" />
                <span className="text-sm text-gray-700">Flag and remove listing</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="action" value="suspend" checked={flagForm.action === "suspend"} onChange={(e) => setFlagForm({ ...flagForm, action: e.target.value })} className="text-purple-600" />
                <span className="text-sm text-gray-700">Flag and suspend seller</span>
              </label>
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowFlagModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={submitFlag}>Submit Flag</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
