import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Car, MapPin, Edit, Trash2 } from "lucide-react";
import { Button, Input, Toggle, Textarea, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const nearbyLots = [
  { id: 1, name: "City Parking Garage", address: "100 Main St", distance: "0.2 miles", price: "$15" },
  { id: 2, name: "Downtown Lot", address: "50 Center Ave", distance: "0.3 miles", price: "$10" },
];

export default function VenueParking() {
  const toast = useToast();
  const [onSiteEnabled, setOnSiteEnabled] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  
  const [onSite, setOnSite] = useState({
    spots: "150",
    price: "20",
    paymentMethods: ["cash", "card"],
  });

  const [instructions, setInstructions] = useState(
    "Enter from Main Street. VIP parking is located in Lot A, closest to the venue entrance. General parking in Lots B and C."
  );

  const [rideshare, setRideshare] = useState("Rideshare drop-off is located at the front entrance on Main Street.");

  const [newLot, setNewLot] = useState({ name: "", address: "", distance: "", price: "" });

  const handleSave = () => {
    toast.success("Parking info saved!");
  };

  const handleAddLot = () => {
    if (!newLot.name.trim()) {
      toast.error("Please enter lot name");
      return;
    }
    toast.success("Parking lot added!");
    setShowAddModal(false);
    setNewLot({ name: "", address: "", distance: "", price: "" });
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
            <h1 className="text-3xl font-bold text-gray-900">Parking Information</h1>
            <p className="text-gray-500">Help guests find parking</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* On-Site Parking */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Car className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">On-Site Parking</h2>
              <p className="text-sm text-gray-500">Parking at your venue</p>
            </div>
          </div>
          <Toggle enabled={onSiteEnabled} onChange={setOnSiteEnabled} />
        </div>

        {onSiteEnabled && (
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Input
              label="Number of Spots"
              type="number"
              value={onSite.spots}
              onChange={(e) => setOnSite({ ...onSite, spots: e.target.value })}
            />
            <Input
              label="Price ($)"
              type="number"
              value={onSite.price}
              onChange={(e) => setOnSite({ ...onSite, price: e.target.value })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Methods</label>
              <div className="flex gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onSite.paymentMethods.includes("cash")}
                    onChange={() => {}}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-sm">Cash</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={onSite.paymentMethods.includes("card")}
                    onChange={() => {}}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-sm">Card</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nearby Parking */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Nearby Parking</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" />
            Add Lot
          </Button>
        </div>

        <div className="space-y-3">
          {nearbyLots.map((lot) => (
            <div key={lot.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{lot.name}</p>
                  <p className="text-sm text-gray-500">{lot.address} • {lot.distance}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-medium text-gray-900">{lot.price}</span>
                <button className="text-gray-400 hover:text-gray-600">
                  <Edit className="w-4 h-4" />
                </button>
                <button className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Parking Instructions</h2>
        <Textarea
          label=""
          placeholder="Add detailed parking instructions for guests..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />
      </div>

      {/* Rideshare */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Rideshare Drop-Off</h2>
        <Textarea
          label=""
          placeholder="Where should Uber/Lyft drop off passengers?"
          value={rideshare}
          onChange={(e) => setRideshare(e.target.value)}
          rows={2}
        />
      </div>

      {/* Add Lot Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Parking Lot"
      >
        <div className="space-y-4">
          <Input
            label="Lot Name"
            placeholder="e.g. City Parking Garage"
            value={newLot.name}
            onChange={(e) => setNewLot({ ...newLot, name: e.target.value })}
          />
          <Input
            label="Address"
            placeholder="123 Main St"
            value={newLot.address}
            onChange={(e) => setNewLot({ ...newLot, address: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Distance"
              placeholder="0.2 miles"
              value={newLot.distance}
              onChange={(e) => setNewLot({ ...newLot, distance: e.target.value })}
            />
            <Input
              label="Price"
              placeholder="$15"
              value={newLot.price}
              onChange={(e) => setNewLot({ ...newLot, price: e.target.value })}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          <Button onClick={handleAddLot}>Add Lot</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
