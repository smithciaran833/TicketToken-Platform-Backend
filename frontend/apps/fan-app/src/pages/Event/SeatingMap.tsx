import { useState } from "react";
import { useParams, useNavigate} from "react-router-dom";
import { ArrowLeft, ZoomIn, ZoomOut, Info } from "lucide-react";

interface Section {
  id: string;
  name: string;
  price: number;
  available: number;
  color: string;
  path: string;
}

const mockSections: Section[] = [
  { id: "floor", name: "Floor", price: 150, available: 23, color: "#9333EA", path: "M150,200 L350,200 L350,280 L150,280 Z" },
  { id: "lower-left", name: "Lower Left", price: 85, available: 45, color: "#7C3AED", path: "M80,150 L140,180 L140,290 L80,320 Z" },
  { id: "lower-right", name: "Lower Right", price: 85, available: 38, color: "#7C3AED", path: "M360,180 L420,150 L420,320 L360,290 Z" },
  { id: "upper-left", name: "Upper Left", price: 55, available: 120, color: "#A78BFA", path: "M50,100 L70,140 L70,330 L50,370 Z" },
  { id: "upper-right", name: "Upper Right", price: 55, available: 98, color: "#A78BFA", path: "M430,140 L450,100 L450,370 L430,330 Z" },
  { id: "balcony", name: "Balcony", price: 45, available: 200, color: "#C4B5FD", path: "M100,80 L400,80 L420,120 L80,120 Z" },
];

export default function SeatingMap() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  const handleSectionClick = (section: Section) => {
    setSelectedSection(section);
  };

  const handleContinue = () => {
    if (selectedSection) {
      navigate(`/event/${id}/tickets?section=${selectedSection.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Select Seats</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ZoomOut className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ZoomIn className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      {/* Seating Map */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="mx-auto transition-transform duration-200"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center top" }}
        >
          <svg
            viewBox="0 0 500 400"
            className="w-full max-w-lg mx-auto"
          >
            {/* Stage */}
            <rect x="150" y="300" width="200" height="40" rx="4" fill="#1F2937" />
            <text x="250" y="325" textAnchor="middle" fill="white" fontSize="14" fontWeight="600">
              STAGE
            </text>

            {/* Sections */}
            {mockSections.map((section) => (
              <g key={section.id}>
                <path
                  d={section.path}
                  fill={selectedSection?.id === section.id ? section.color : `${section.color}80`}
                  stroke={section.color}
                  strokeWidth="2"
                  className="cursor-pointer transition-all hover:opacity-80"
                  onClick={() => handleSectionClick(section)}
                />
              </g>
            ))}
          </svg>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          {mockSections.map((section) => (
            <div key={section.id} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: section.color }}
              />
              <span className="text-sm text-gray-600">{section.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section Info & Continue */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-4">
        {selectedSection ? (
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">{selectedSection.name}</h3>
                <p className="text-sm text-gray-500">{selectedSection.available} seats available</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">${selectedSection.price}</p>
                <p className="text-sm text-gray-500">per ticket</p>
              </div>
            </div>
            <button
              onClick={handleContinue}
              className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all"
            >
              Continue
            </button>
          </div>
        ) : (
          <div className="max-w-lg mx-auto flex items-center justify-center gap-2 py-3 text-gray-500">
            <Info className="w-5 h-5" />
            <span>Tap a section to see pricing</span>
          </div>
        )}
      </div>
    </div>
  );
}
