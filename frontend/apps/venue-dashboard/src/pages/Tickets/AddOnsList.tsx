import { useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Copy, Car, ShoppingBag, UtensilsCrossed, Crown, Package, ToggleLeft, ToggleRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Dropdown, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const initialAddOns = [
  { id: 1, name: "Parking Pass", description: "Reserved parking spot", event: "All Events", eventId: null, category: "parking", price: 25, quantity: null, sold: 234, maxPerOrder: 2, status: "Active" },
  { id: 2, name: "VIP Lounge Access", description: "Access to exclusive VIP lounge", event: "Summer Music Festival", eventId: 1, category: "vip-upgrade", price: 75, quantity: null, sold: 89, maxPerOrder: 4, status: "Active" },
  { id: 3, name: "Meet & Greet", description: "Meet the artists backstage", event: "Summer Music Festival", eventId: 1, category: "vip-upgrade", price: 200, quantity: 20, sold: 20, maxPerOrder: 1, status: "Sold Out" },
  { id: 4, name: "Merch Bundle", description: "T-shirt + Poster combo", event: "All Events", eventId: null, category: "merchandise", price: 45, quantity: null, sold: 156, maxPerOrder: 5, status: "Active" },
  { id: 5, name: "Food & Drink Voucher", description: "$25 credit for food and beverages", event: "All Events", eventId: null, category: "food-drink", price: 20, quantity: null, sold: 312, maxPerOrder: 10, status: "Active" },
];

const categories = [
  { value: "parking", label: "Parking", icon: Car },
  { value: "merchandise", label: "Merchandise", icon: ShoppingBag },
  { value: "food-drink", label: "Food & Drink", icon: UtensilsCrossed },
  { value: "vip-upgrade", label: "VIP Upgrade", icon: Crown },
  { value: "other", label: "Other", icon: Package },
];

function getStatusClasses(status: string) {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700";
    case "Sold Out": return "bg-purple-100 text-purple-700";
    case "Inactive": return "bg-gray-100 text-gray-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function getCategoryIcon(category: string) {
  const cat = categories.find(c => c.value === category);
  if (cat) {
    const Icon = cat.icon;
    return <Icon className="w-4 h-4" />;
  }
  return <Package className="w-4 h-4" />;
}

export default function AddOnsList() {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [addOns, setAddOns] = useState(initialAddOns);
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<typeof initialAddOns[0] | null>(null);

  const filteredAddOns = addOns.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.event.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDuplicate = (addOn: typeof initialAddOns[0]) => {
    const newAddOn = { ...addOn, id: Date.now(), name: addOn.name + " (Copy)", sold: 0, status: "Active" };
    setAddOns([...addOns, newAddOn]);
    toast.success("Add-on duplicated!");
  };

  const handleToggleStatus = (addOn: typeof initialAddOns[0]) => {
    const newStatus = addOn.status === "Active" ? "Inactive" : "Active";
    setAddOns(addOns.map(a => a.id === addOn.id ? { ...a, status: newStatus } : a));
    toast.success(newStatus === "Active" ? "Add-on activated" : "Add-on deactivated");
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setAddOns(addOns.filter(a => a.id !== deleteTarget.id));
      toast.success("Add-on deleted!");
      setShowDeleteModal(false);
    }
  };

  const getDropdownItems = (addOn: typeof initialAddOns[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => navigate(`/venue/tickets/addons/${addOn.id}/edit`) },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => handleDuplicate(addOn) },
    ...(addOn.status !== "Sold Out" ? [
      { label: addOn.status === "Active" ? "Deactivate" : "Activate", icon: addOn.status === "Active" ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />, onClick: () => handleToggleStatus(addOn) },
    ] : []),
    ...(addOn.sold === 0 ? [
      { divider: true, label: "", onClick: () => {} },
      { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setDeleteTarget(addOn); setShowDeleteModal(true); }},
    ] : []),
  ];

  const totalSold = filteredAddOns.reduce((sum, a) => sum + a.sold, 0);
  const totalRevenue = filteredAddOns.reduce((sum, a) => sum + (a.sold * a.price), 0);

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Add-Ons</h1>
        <Link to="/venue/tickets/addons/new">
          <Button>
            <Plus className="w-5 h-5" />
            <span>Create Add-On</span>
          </Button>
        </Link>
      </div>

      {/* Sub Navigation */}
      <div className="flex gap-4 mb-6">
        <Link to="/venue/tickets" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Ticket Types
        </Link>
        <Link to="/venue/tickets/bundles" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Bundles
        </Link>
        <Link to="/venue/tickets/addons" className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium">
          Add-Ons
        </Link>
        <Link to="/venue/tickets/promos" className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
          Promo Codes
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Add-Ons</p>
          <p className="text-2xl font-bold text-gray-900">{filteredAddOns.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Units Sold</p>
          <p className="text-2xl font-bold text-purple-600">{totalSold.toLocaleString()}</p>
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
            placeholder="Search add-ons..."
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sold</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredAddOns.map((addOn) => (
              <tr key={addOn.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/venue/tickets/addons/${addOn.id}/edit`)}>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{addOn.name}</div>
                  <div className="text-xs text-gray-500">{addOn.description}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    {getCategoryIcon(addOn.category)}
                    <span className="capitalize">{addOn.category.replace("-", " ")}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{addOn.event}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">${addOn.price}</td>
                <td className="px-6 py-4 text-sm text-gray-900">
                  {addOn.sold}{addOn.quantity ? ` / ${addOn.quantity}` : ""}
                </td>
                <td className="px-6 py-4">
                  <span className={"inline-flex px-2 py-1 text-xs font-medium rounded-full " + getStatusClasses(addOn.status)}>
                    {addOn.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(addOn)} />
                </td>
              </tr>
            ))}
            {filteredAddOns.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No add-ons found. <Link to="/venue/tickets/addons/new" className="text-purple-600 hover:text-purple-700">Create your first add-on</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Add-On" size="sm">
        <p className="text-gray-600">Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
