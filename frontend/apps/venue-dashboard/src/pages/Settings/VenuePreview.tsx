import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Monitor, Tablet, Smartphone, Edit, Globe, MapPin, Clock, Calendar, Star } from "lucide-react";
import { Button, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

export default function VenuePreview() {
  const toast = useToast();
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [showPublishModal, setShowPublishModal] = useState(false);

  const requirements = [
    { name: "Profile complete", done: true },
    { name: "Photos added", done: true },
    { name: "Hours set", done: true },
    { name: "Location verified", done: true },
    { name: "Stripe connected", done: false },
  ];

  const allComplete = requirements.every(r => r.done);

  const handlePublish = () => {
    if (allComplete) {
      toast.success("Venue page published!");
      setShowPublishModal(false);
    }
  };

  const getPreviewWidth = () => {
    switch (device) {
      case "tablet": return "max-w-2xl";
      case "mobile": return "max-w-sm";
      default: return "max-w-full";
    }
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Preview Venue Page</h1>
            <p className="text-gray-500">See how your venue appears to fans</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/venue/settings/profile">
            <Button variant="secondary">
              <Edit className="w-4 h-4" />
              Edit
            </Button>
          </Link>
          <Button onClick={() => setShowPublishModal(true)}>
            <Globe className="w-4 h-4" />
            Publish
          </Button>
        </div>
      </div>

      {/* Device Toggle */}
      <div className="flex items-center justify-center gap-2 mb-6 bg-gray-100 rounded-lg p-1 w-fit mx-auto">
        <button
          onClick={() => setDevice("desktop")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            device === "desktop" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Monitor className="w-4 h-4" />
          Desktop
        </button>
        <button
          onClick={() => setDevice("tablet")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            device === "tablet" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Tablet className="w-4 h-4" />
          Tablet
        </button>
        <button
          onClick={() => setDevice("mobile")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            device === "mobile" ? "bg-white shadow text-gray-900" : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Mobile
        </button>
      </div>

      {/* Preview Frame */}
      <div className={`${getPreviewWidth()} mx-auto bg-white rounded-lg border border-gray-300 shadow-lg overflow-hidden`}>
        {/* Cover */}
        <div className="h-48 bg-gradient-to-r from-purple-600 to-purple-800 relative">
          <div className="absolute bottom-4 left-4 text-white">
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm">4.8 (234 reviews)</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">The Grand Theater</h1>
          
          <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>Downtown, New York</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Open until 11 PM</span>
            </div>
          </div>

          <p className="text-gray-600 mb-6">
            The Grand Theater is a historic 2,500-seat venue located in the heart of downtown. 
            Built in 1920, it has hosted countless legendary performances and continues to be 
            the premier destination for live entertainment in the region.
          </p>

          {/* Upcoming Events */}
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Upcoming Events</h2>
          <div className="space-y-3 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="w-16 h-16 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">Summer Music Festival</p>
                  <p className="text-sm text-gray-500">Jul {15 + i}, 2025 • 7:00 PM</p>
                </div>
                <Button size="sm">Tickets</Button>
              </div>
            ))}
          </div>

          {/* Photo Gallery Preview */}
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Photos</h2>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>

      {/* Publish Modal */}
      <Modal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        title="Publish Venue Page"
      >
        <div className="space-y-4">
          <p className="text-gray-600">Before publishing, make sure everything is complete:</p>
          <div className="space-y-2">
            {requirements.map((req, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  req.done ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"
                }`}>
                  {req.done ? "✓" : "○"}
                </div>
                <span className={req.done ? "text-gray-900" : "text-gray-500"}>{req.name}</span>
              </div>
            ))}
          </div>
          {!allComplete && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                Complete all requirements before publishing.
              </p>
            </div>
          )}
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowPublishModal(false)}>Cancel</Button>
          <Button onClick={handlePublish} disabled={!allComplete}>
            {allComplete ? "Publish" : "Complete Setup First"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
