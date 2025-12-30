import { useState } from "react";
import { ArrowLeft, Edit } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Modal, ModalFooter, Input, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const initialSections = [
  { id: 1, name: "Floor - Front", capacity: 200, sold: 187, price: 150, color: "#9333EA" },
  { id: 2, name: "Floor - Back", capacity: 300, sold: 245, price: 100, color: "#7C3AED" },
  { id: 3, name: "Balcony - Center", capacity: 150, sold: 150, price: 120, color: "#6366F1" },
  { id: 4, name: "Balcony - Left", capacity: 100, sold: 78, price: 80, color: "#8B5CF6" },
  { id: 5, name: "Balcony - Right", capacity: 100, sold: 82, price: 80, color: "#8B5CF6" },
  { id: 6, name: "GA Standing", capacity: 500, sold: 412, price: 65, color: "#A855F7" },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Content", path: "/content" },
  { name: "Tickets", path: "/tickets" },
  { name: "Seating", path: "/seating" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

export default function EventSeating() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [sections, setSections] = useState(initialSections);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSection, setEditingSection] = useState<typeof initialSections[0] | null>(null);
  const [editPrice, setEditPrice] = useState(0);

  const totalCapacity = sections.reduce((sum, s) => sum + s.capacity, 0);
  const totalSold = sections.reduce((sum, s) => sum + s.sold, 0);

  const openEditSection = (section: typeof initialSections[0]) => {
    setEditingSection(section);
    setEditPrice(section.price);
    setShowEditModal(true);
  };

  const handleSavePrice = () => {
    if (editingSection) {
      setSections(sections.map(s => 
        s.id === editingSection.id ? { ...s, price: editPrice } : s
      ));
      toast.success("Section price updated!");
      setShowEditModal(false);
    }
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Seating map</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Seating"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Seating Map Visual */}
        <div className="col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Venue Layout</h2>
          <div className="bg-gray-100 rounded-lg p-8">
            {/* Stage */}
            <div className="bg-gray-800 text-white text-center py-4 rounded-t-lg mb-4">
              STAGE
            </div>
            
            {/* Floor sections */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                onClick={() => openEditSection(sections[0])}
                className="p-4 rounded-lg text-white text-center hover:opacity-90 transition-opacity"
                style={{ backgroundColor: sections[0].color }}
              >
                <p className="font-medium">{sections[0].name}</p>
                <p className="text-sm opacity-80">{sections[0].sold}/{sections[0].capacity}</p>
              </button>
              <button
                onClick={() => openEditSection(sections[1])}
                className="p-4 rounded-lg text-white text-center hover:opacity-90 transition-opacity"
                style={{ backgroundColor: sections[1].color }}
              >
                <p className="font-medium">{sections[1].name}</p>
                <p className="text-sm opacity-80">{sections[1].sold}/{sections[1].capacity}</p>
              </button>
            </div>

            {/* GA Standing */}
            <button
              onClick={() => openEditSection(sections[5])}
              className="w-full p-4 rounded-lg text-white text-center mb-4 hover:opacity-90 transition-opacity"
              style={{ backgroundColor: sections[5].color }}
            >
              <p className="font-medium">{sections[5].name}</p>
              <p className="text-sm opacity-80">{sections[5].sold}/{sections[5].capacity}</p>
            </button>

            {/* Balcony sections */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => openEditSection(sections[3])}
                className="p-4 rounded-lg text-white text-center hover:opacity-90 transition-opacity"
                style={{ backgroundColor: sections[3].color }}
              >
                <p className="font-medium text-sm">{sections[3].name}</p>
                <p className="text-xs opacity-80">{sections[3].sold}/{sections[3].capacity}</p>
              </button>
              <button
                onClick={() => openEditSection(sections[2])}
                className="p-4 rounded-lg text-white text-center hover:opacity-90 transition-opacity"
                style={{ backgroundColor: sections[2].color }}
              >
                <p className="font-medium text-sm">{sections[2].name}</p>
                <p className="text-xs opacity-80">{sections[2].sold}/{sections[2].capacity}</p>
              </button>
              <button
                onClick={() => openEditSection(sections[4])}
                className="p-4 rounded-lg text-white text-center hover:opacity-90 transition-opacity"
                style={{ backgroundColor: sections[4].color }}
              >
                <p className="font-medium text-sm">{sections[4].name}</p>
                <p className="text-xs opacity-80">{sections[4].sold}/{sections[4].capacity}</p>
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded" />
              <span className="text-sm text-gray-600">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-yellow-500 rounded" />
              <span className="text-sm text-gray-600">Limited</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded" />
              <span className="text-sm text-gray-600">Sold Out</span>
            </div>
          </div>
        </div>

        {/* Section List */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Sections</h2>
          
          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-gray-500">Total Capacity</span>
              <span className="text-sm font-medium text-gray-900">{totalCapacity}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-gray-500">Total Sold</span>
              <span className="text-sm font-medium text-gray-900">{totalSold}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Available</span>
              <span className="text-sm font-medium text-green-600">{totalCapacity - totalSold}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full mt-3">
              <div 
                className="h-2 bg-purple-600 rounded-full" 
                style={{ width: `${(totalSold / totalCapacity) * 100}%` }}
              />
            </div>
          </div>

          {/* Section list */}
          <div className="space-y-3">
            {sections.map((section) => (
              <div
                key={section.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: section.color }}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{section.name}</p>
                    <p className="text-xs text-gray-500">{section.sold}/{section.capacity} sold</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">${section.price}</span>
                  <button
                    onClick={() => openEditSection(section)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit Section Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Section"
        size="sm"
      >
        {editingSection && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Section</p>
              <p className="font-medium text-gray-900">{editingSection.name}</p>
              <div className="flex justify-between mt-2">
                <span className="text-sm text-gray-500">Sold</span>
                <span className="text-sm text-gray-900">{editingSection.sold} / {editingSection.capacity}</span>
              </div>
            </div>
            <Input
              label="Price"
              type="number"
              min="0"
              step="0.01"
              value={editPrice}
              onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
            />
            {editingSection.sold > 0 && (
              <p className="text-sm text-yellow-600">
                Note: Changing price only affects future sales. {editingSection.sold} tickets already sold at ${editingSection.price}.
              </p>
            )}
          </div>
        )}
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button onClick={handleSavePrice}>Save Price</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
