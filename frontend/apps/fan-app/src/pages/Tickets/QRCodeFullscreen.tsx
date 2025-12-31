import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { X } from "lucide-react";

const mockTicket = {
  eventTitle: "Japanese Breakfast",
  ticketType: "General Admission",
  section: "Floor",
  holderName: "John Smith",
};

export default function QRCodeFullscreen() {
  const { id: _id } = useParams();
  const navigate = useNavigate();

  // Increase screen brightness (request in real implementation)
  useEffect(() => {
    // In a real React Native app, you'd use a brightness API
    // For web, we just make the background white
    document.body.style.backgroundColor = "#fff";
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6"
      onClick={() => navigate(-1)}
    >
      {/* Close Button */}
      <button
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100"
        onClick={() => navigate(-1)}
      >
        <X className="w-5 h-5 text-gray-600" />
      </button>

      {/* Event Info */}
      <div className="text-center mb-8">
        <h1 className="text-xl font-bold text-gray-900">{mockTicket.eventTitle}</h1>
        <p className="text-gray-500 mt-1">{mockTicket.ticketType}</p>
        {mockTicket.section && (
          <p className="text-purple-600 font-medium mt-1">{mockTicket.section}</p>
        )}
      </div>

      {/* QR Code */}
      <div className="w-72 h-72 bg-white rounded-3xl shadow-lg flex items-center justify-center mb-8 border border-gray-100">
        <svg viewBox="0 0 100 100" className="w-56 h-56">
          {/* QR Code Pattern - simplified representation */}
          <rect x="10" y="10" width="25" height="25" fill="#111" rx="3" />
          <rect x="65" y="10" width="25" height="25" fill="#111" rx="3" />
          <rect x="10" y="65" width="25" height="25" fill="#111" rx="3" />
          <rect x="15" y="15" width="15" height="15" fill="white" rx="2" />
          <rect x="70" y="15" width="15" height="15" fill="white" rx="2" />
          <rect x="15" y="70" width="15" height="15" fill="white" rx="2" />
          <rect x="19" y="19" width="7" height="7" fill="#111" rx="1" />
          <rect x="74" y="19" width="7" height="7" fill="#111" rx="1" />
          <rect x="19" y="74" width="7" height="7" fill="#111" rx="1" />
          {/* Data pattern */}
          <rect x="40" y="10" width="4" height="4" fill="#111" />
          <rect x="48" y="10" width="4" height="4" fill="#111" />
          <rect x="40" y="18" width="4" height="4" fill="#111" />
          <rect x="52" y="18" width="4" height="4" fill="#111" />
          <rect x="10" y="40" width="4" height="4" fill="#111" />
          <rect x="18" y="44" width="4" height="4" fill="#111" />
          <rect x="10" y="52" width="4" height="4" fill="#111" />
          <rect x="40" y="40" width="20" height="20" fill="#111" rx="2" />
          <rect x="45" y="45" width="10" height="10" fill="white" rx="1" />
          <rect x="86" y="40" width="4" height="4" fill="#111" />
          <rect x="86" y="48" width="4" height="4" fill="#111" />
          <rect x="78" y="52" width="4" height="4" fill="#111" />
          <rect x="40" y="86" width="4" height="4" fill="#111" />
          <rect x="52" y="82" width="4" height="4" fill="#111" />
          <rect x="65" y="65" width="4" height="4" fill="#111" />
          <rect x="73" y="69" width="4" height="4" fill="#111" />
          <rect x="81" y="73" width="4" height="4" fill="#111" />
          <rect x="77" y="81" width="4" height="4" fill="#111" />
          <rect x="85" y="85" width="4" height="4" fill="#111" />
        </svg>
      </div>

      {/* Holder Name */}
      <p className="text-lg font-medium text-gray-900">{mockTicket.holderName}</p>

      {/* Instructions */}
      <p className="text-sm text-gray-400 mt-8">Tap anywhere to close</p>

      {/* Screenshot Warning */}
      <p className="text-xs text-gray-400 mt-2">
        Screenshots may not be accepted for entry
      </p>
    </div>
  );
}
