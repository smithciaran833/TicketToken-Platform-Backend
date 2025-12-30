import { useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Copy, Tag, Gift } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

interface BundleItem {
  type: "ticket" | "addon";
  itemId: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
}

interface Bundle {
  id: number;
  name: string;
  description: string;
  event: string;
  eventId: number;
  items: BundleItem[];
  price: number;
  originalPrice: number;
  quantity: number | null;
  sold: number;
  status: string;
}

const initialBundles: Bundle[] = [
  { 
    id: 1, name: "Date Night Package", description: "Perfect for couples",
    event: "Summer Music Festival", eventId: 1,
    items: [
      { type: "ticket", itemId: 1, itemName: "General Admission", quantity: 2, unitPrice: 65 },
      { type: "addon", itemId: 1, itemName: "Parking Pass", quantity: 1, unitPrice: 25 },
    ],
    price: 145, originalPrice: 155, quantity: null, sold: 45, status: "Active" 
  },
  { 
    id: 2, name: "VIP Experience", description: "The ultimate festival experience",
    event: "Summer Music Festival", eventId: 1,
    items: [
      { type: "ticket", itemId: 2, itemName: "VIP Access", quantity: 1, unitPrice: 150 },
      { type: "addon", itemId: 3, itemName: "Meet & Greet", quantity: 1, unitPrice: 200 },
    ],
    price: 320, originalPrice: 350, quantity: 50, sold: 12, status: "Active" 
  },
  { 
    id: 3, name: "Group Pack (4)", description: "Great value for groups",
    event: "Summer Music Festival", eventId: 1,
    items: [
      { type: "ticket", itemId: 1, itemName: "General Admission", quantity: 4, unitPrice: 65 },
      { type: "addon", itemId: 1, itemName: "Parking Pass", quantity: 1, unitPrice: 25 },
    ],
    price: 250, originalPrice: 285, quantity: null, sold: 28, status: "Active" 
  },
];

function getStatusClasses(status: string) {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700";
    case "Draft": return "bg-yellow-100 text-yellow-700";
    case "Sold Out": return "bg-purple-100 text-purple-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function BundlesList() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Bundle | null>(null);

  const filteredBundles = bundles.filter(b =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.event.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDuplicate = (bundle: Bundle) => {
    const newBundle = { ...bundle, id: Date.now(), name: bundle.name + " (Copy)", sold: 0, status: "Draft" };
    setBundles([...bundles, newBundle]);
    toast.success("Bundle duplicated!");
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setBundles(bundles.filter(b => b.id !== deleteTarget.id));
      toast.success("Bundle deleted!");
      setShowDeleteModal(false);
    }
  };

  const getDropdownItems = (bundle: Bundle) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => navigate(`/venue/tickets/bundles/${bundle.id}/edit`) },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => handleDuplicate(bundle) },
    ...(bundle.sold === 0 ? [
      { divider: true, label: "", onClick: () => {} },
      { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setDeleteTarget(bundle); setShowDeleteModal(true); }},
    ] : []),
  ];

  const totalSold = filteredBundles.reduce((sum, b) => sum + b.sold, 0);
  const totalRevenue = filteredBundles.reduce((sum, b) => sum + (b.sold * b.price), 0);

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Bundles</h1>
        <Link to="/venue/tickets/bundles/new">
          <Button>
            <Plus className="w-5 h-5" />
            <span>Create Bundle</span>
          </Button>
        </Link>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-4 mb-6">
        <Link to="/venue/tickets" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Ticket Types
        </Link>
        <Link to="/venue/tickets/bundles" className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium">
          Bundles
        </Link>
        <Link to="/venue/tickets/addons" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Add-Ons
        </Link>
        <Link to="/venue/tickets/promos" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Promo Codes
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Bundles</p>
          <p className="text-2xl font-bold text-gray-900">{filteredBundles.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Bundles Sold</p>
          <p className="text-2xl font-bold text-purple-600">{totalSold}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue</p>
          <p className="text-2xl font-bold text-green-600">${totalRevenue.toLocaleString()}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search bundles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bundle</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Includes</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredBundles.map((bundle) => (
              <tr key={bundle.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/venue/tickets/bundles/${bundle.id}/edit`)}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{bundle.name}</div>
                  <div className="text-xs text-gray-500">{bundle.description}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{bundle.event}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {bundle.items.map((item, i) => (
                      <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${item.type === "ticket" ? "bg-purple-50 text-purple-700" : "bg-blue-50 text-blue-700"}`}>
                        {item.type === "ticket" ? <Tag className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
                        {item.quantity}x {item.itemName}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">${bundle.price}</div>
                  <div className="text-xs text-green-600">Save ${bundle.originalPrice - bundle.price}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{bundle.sold}</td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(bundle.status)}>
                    {bundle.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(bundle)} />
                </td>
              </tr>
            ))}
            {filteredBundles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No bundles found. <Link to="/venue/tickets/bundles/new" className="text-purple-600 hover:text-purple-700">Create your first bundle</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Bundle" size="sm">
        <p className="text-gray-600">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
