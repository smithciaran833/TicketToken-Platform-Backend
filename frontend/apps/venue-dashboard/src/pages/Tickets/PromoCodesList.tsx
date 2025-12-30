import { useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Copy, BarChart3, Download, Eye } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const initialPromoCodes = [
  { id: 1, code: "SUMMER20", discountType: "percentage", discountValue: 20, event: "All Events", eventId: null, uses: 145, maxUses: 500, validFrom: "2025-06-01", validUntil: "2025-08-01", status: "Active" },
  { id: 2, code: "VIPFRIEND", discountType: "fixed", discountValue: 50, event: "Summer Music Festival", eventId: 1, uses: 23, maxUses: 100, validFrom: "2025-06-01", validUntil: "2025-07-15", status: "Active" },
  { id: 3, code: "EARLYBIRD", discountType: "percentage", discountValue: 15, event: "All Events", eventId: null, uses: 300, maxUses: 300, validFrom: "2025-04-01", validUntil: "2025-06-01", status: "Expired" },
  { id: 4, code: "FLASH10", discountType: "fixed", discountValue: 10, event: "All Events", eventId: null, uses: 0, maxUses: 50, validFrom: "2025-12-01", validUntil: "2025-12-31", status: "Scheduled" },
  { id: 5, code: "FREETICKET", discountType: "free", discountValue: 1, event: "Jazz Night", eventId: 5, uses: 5, maxUses: 20, validFrom: "2025-06-01", validUntil: "2025-07-20", status: "Active" },
];

const tabs = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
];

function getStatusClasses(status: string) {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700";
    case "Expired": return "bg-gray-100 text-gray-700";
    case "Scheduled": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatDiscount(type: string, value: number) {
  if (type === "percentage") return `${value}% off`;
  if (type === "fixed") return `$${value} off`;
  if (type === "free") return `${value} Free Ticket${value > 1 ? "s" : ""}`;
  return value.toString();
}

export default function PromoCodesList() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [promoCodes, setPromoCodes] = useState(initialPromoCodes);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<typeof initialPromoCodes[0] | null>(null);

  // Filter promo codes
  let filteredCodes = promoCodes;
  
  if (activeTab === "active") {
    filteredCodes = filteredCodes.filter(p => p.status === "Active");
  } else if (activeTab === "expired") {
    filteredCodes = filteredCodes.filter(p => p.status === "Expired");
  }
  
  if (searchQuery) {
    filteredCodes = filteredCodes.filter(p =>
      p.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setPromoCodes(promoCodes.filter(p => p.id !== deleteTarget.id));
      toast.success("Promo code deleted!");
      setShowDeleteModal(false);
    }
  };

  const handleExport = () => {
    toast.success("Exporting promo codes...");
  };

  const getDropdownItems = (promo: typeof initialPromoCodes[0]) => [
    { label: "View Details", icon: <Eye className="w-4 h-4" />, onClick: () => navigate(`/venue/tickets/promos/${promo.id}`) },
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => navigate(`/venue/tickets/promos/${promo.id}/edit`) },
    { label: "Copy Code", icon: <Copy className="w-4 h-4" />, onClick: () => copyCode(promo.code) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setDeleteTarget(promo); setShowDeleteModal(true); }},
  ];

  const totalUses = promoCodes.reduce((sum, p) => sum + p.uses, 0);

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Promo Codes</h1>
        <div className="flex items-center gap-3">
          <Link to="/venue/tickets/promos/bulk">
            <Button variant="secondary">Bulk Create</Button>
          </Link>
          <Link to="/venue/tickets/promos/analytics">
            <Button variant="secondary">
              <BarChart3 className="w-4 h-4" />
              <span>Analytics</span>
            </Button>
          </Link>
          <Link to="/venue/tickets/promos/new">
            <Button>
              <Plus className="w-5 h-5" />
              <span>Create Promo Code</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-4 mb-6">
        <Link to="/venue/tickets" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Ticket Types
        </Link>
        <Link to="/venue/tickets/bundles" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Bundles
        </Link>
        <Link to="/venue/tickets/addons" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Add-Ons
        </Link>
        <Link to="/venue/tickets/promos" className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium">
          Promo Codes
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Codes</p>
          <p className="text-2xl font-bold text-gray-900">{promoCodes.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active Codes</p>
          <p className="text-2xl font-bold text-green-600">{promoCodes.filter(p => p.status === "Active").length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Uses</p>
          <p className="text-2xl font-bold text-purple-600">{totalUses.toLocaleString()}</p>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id
                ? "px-4 py-2 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                : "px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search codes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <Button variant="secondary" onClick={handleExport}>
            <Download className="w-4 h-4" />
            <span>Export</span>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Discount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event(s)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uses</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid Dates</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredCodes.map((promo) => (
              <tr key={promo.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/venue/tickets/promos/${promo.id}`)}>
                <td className="px-6 py-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); copyCode(promo.code); }}
                    className="font-mono text-sm font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100"
                  >
                    {promo.code}
                  </button>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {formatDiscount(promo.discountType, promo.discountValue)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{promo.event}</td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{promo.uses} / {promo.maxUses}</div>
                  <div className="w-16 h-1.5 bg-gray-200 rounded-full mt-1">
                    <div className="h-1.5 bg-purple-600 rounded-full" style={{ width: `${(promo.uses / promo.maxUses) * 100}%` }} />
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {promo.validFrom} - {promo.validUntil}
                </td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(promo.status)}>
                    {promo.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(promo)} />
                </td>
              </tr>
            ))}
            {filteredCodes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No promo codes found. <Link to="/venue/tickets/promos/new" className="text-purple-600 hover:text-purple-700">Create your first promo code</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Promo Code" size="sm">
        <p className="text-gray-600">Are you sure you want to delete <strong>{deleteTarget?.code}</strong>?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
