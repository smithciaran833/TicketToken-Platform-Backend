import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Edit, ZoomIn, ZoomOut } from "lucide-react";
import { Button, Select } from "../../components/ui";

const configurations = [
  { value: "1", label: "Theater Style" },
  { value: "2", label: "Standing Room" },
  { value: "3", label: "Banquet" },
];

const legend = [
  { label: "VIP", color: "bg-purple-500" },
  { label: "Premium", color: "bg-blue-500" },
  { label: "Standard", color: "bg-green-500" },
  { label: "Economy", color: "bg-gray-500" },
  { label: "Accessible", color: "bg-yellow-500" },
  { label: "Unavailable", color: "bg-gray-300" },
];

export default function SeatingPreview() {
  const [selectedConfig, setSelectedConfig] = useState("1");
  const [zoom, setZoom] = useState(100);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const handleSectionClick = (sectionName: string) => {
    setSelectedSection(sectionName);
  };

  return (
    <div className="h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings/seating/configs" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Preview Seating Map</h1>
            <p className="text-sm text-gray-500">View seating layout as customers see it</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select
            label=""
            options={configurations}
            value={selectedConfig}
            onChange={(e) => setSelectedConfig(e.target.value)}
          />
          <Link to={`/venue/settings/seating/builder?config=${selectedConfig}`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4" />
              Edit Map
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-4 h-full">
        {/* Map Preview */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden relative">
          {/* Zoom Controls */}
          <div className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-white rounded-lg shadow p-1">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-600 w-12 text-center">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 10))}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Map */}
          <div 
            className="w-full h-full flex items-center justify-center bg-gray-50 p-8"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}
          >
            <div className="text-center">
              {/* Stage */}
              <div className="w-80 h-12 bg-gray-800 rounded-lg flex items-center justify-center text-white text-sm mb-8 mx-auto">
                STAGE
              </div>

              {/* Orchestra */}
              <div 
                className={`mb-4 p-4 rounded-lg cursor-pointer transition-all ${
                  selectedSection === "Orchestra Center" ? "ring-2 ring-purple-500 bg-purple-50" : "hover:bg-gray-100"
                }`}
                onClick={() => handleSectionClick("Orchestra Center")}
              >
                <div className="text-xs text-gray-500 mb-2">ORCHESTRA CENTER</div>
                <div className="flex flex-wrap justify-center gap-1 max-w-md">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm bg-purple-500" />
                  ))}
                </div>
              </div>

              <div className="flex gap-4 justify-center mb-4">
                <div 
                  className={`p-4 rounded-lg cursor-pointer transition-all ${
                    selectedSection === "Orchestra Left" ? "ring-2 ring-purple-500 bg-purple-50" : "hover:bg-gray-100"
                  }`}
                  onClick={() => handleSectionClick("Orchestra Left")}
                >
                  <div className="text-xs text-gray-500 mb-2">ORCH LEFT</div>
                  <div className="flex flex-wrap justify-center gap-1 w-32">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} className="w-3 h-3 rounded-sm bg-blue-500" />
                    ))}
                  </div>
                </div>
                <div 
                  className={`p-4 rounded-lg cursor-pointer transition-all ${
                    selectedSection === "Orchestra Right" ? "ring-2 ring-purple-500 bg-purple-50" : "hover:bg-gray-100"
                  }`}
                  onClick={() => handleSectionClick("Orchestra Right")}
                >
                  <div className="text-xs text-gray-500 mb-2">ORCH RIGHT</div>
                  <div className="flex flex-wrap justify-center gap-1 w-32">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div key={i} className="w-3 h-3 rounded-sm bg-blue-500" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Mezzanine */}
              <div 
                className={`p-4 rounded-lg cursor-pointer transition-all ${
                  selectedSection === "Mezzanine" ? "ring-2 ring-purple-500 bg-purple-50" : "hover:bg-gray-100"
                }`}
                onClick={() => handleSectionClick("Mezzanine")}
              >
                <div className="text-xs text-gray-500 mb-2">MEZZANINE</div>
                <div className="flex flex-wrap justify-center gap-1 max-w-sm mx-auto">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm bg-green-500" />
                  ))}
                </div>
              </div>

              {/* Balcony */}
              <div 
                className={`mt-4 p-4 rounded-lg cursor-pointer transition-all ${
                  selectedSection === "Balcony" ? "ring-2 ring-purple-500 bg-purple-50" : "hover:bg-gray-100"
                }`}
                onClick={() => handleSectionClick("Balcony")}
              >
                <div className="text-xs text-gray-500 mb-2">BALCONY</div>
                <div className="flex flex-wrap justify-center gap-1 max-w-xs mx-auto">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div key={i} className="w-3 h-3 rounded-sm bg-gray-500" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Panel */}
        <div className="w-72 bg-white rounded-lg border border-gray-200 p-4">
          {/* Legend */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Legend</h3>
            <div className="space-y-2">
              {legend.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${item.color}`} />
                  <span className="text-sm text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Section Info */}
          {selectedSection ? (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Section Details</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="font-medium text-gray-900">{selectedSection}</p>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>Capacity: 500 seats</p>
                  <p>Tier: VIP</p>
                  <p>Price: $150</p>
                  <p>Available: 423 seats</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 text-center">
                Click a section to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
