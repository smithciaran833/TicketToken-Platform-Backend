import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Share2, MapPin, Calendar, Clock, QrCode, Wallet, Send, DollarSign, ChevronRight } from "lucide-react";

const mockTicket = {
  id: 1,
  eventName: "Summer Music Festival 2025",
  date: "Saturday, July 15, 2025",
  time: "4:00 PM",
  doorsOpen: "3:00 PM",
  venue: {
    name: "Central Park Great Lawn",
    address: "New York, NY 10024",
  },
  ticketType: "VIP Access",
  section: "Front Stage",
  holderName: "John Smith",
  qrCode: "TICKET-ABC123-XYZ",
  image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800",
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showQR, setShowQR] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Hero */}
      <div className="relative h-48">
        <img src={mockTicket.image} alt={mockTicket.eventName} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        <div className="absolute bottom-4 left-4 right-4 text-white">
          <h1 className="text-xl font-bold">{mockTicket.eventName}</h1>
        </div>
      </div>

      {/* QR Code Section */}
      <div className="bg-white mx-4 -mt-4 rounded-xl shadow-lg p-4 relative z-10">
        <div 
          className="aspect-square max-w-[200px] mx-auto bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer"
          onClick={() => setShowQR(true)}
        >
          <div className="text-center">
            <QrCode className="w-24 h-24 text-gray-800 mx-auto" />
            <p className="text-sm text-gray-500 mt-2">Tap to enlarge</p>
          </div>
        </div>
        <div className="text-center mt-4">
          <p className="font-semibold text-gray-900">{mockTicket.ticketType}</p>
          <p className="text-sm text-gray-500">{mockTicket.section}</p>
          <p className="text-xs text-gray-400 mt-1">{mockTicket.holderName}</p>
        </div>
      </div>

      {/* Event Details */}
      <div className="px-4 py-4 space-y-4">
        <div className="bg-white rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{mockTicket.date}</p>
              <p className="text-sm text-gray-500">{mockTicket.time}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Doors Open</p>
              <p className="text-sm text-gray-500">{mockTicket.doorsOpen}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{mockTicket.venue.name}</p>
              <p className="text-sm text-gray-500">{mockTicket.venue.address}</p>
            </div>
            <button className="text-purple-600 text-sm font-medium">Directions</button>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-xl divide-y divide-gray-100">
          <button className="flex items-center justify-between w-full p-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Add to Wallet</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
          <Link to={`/tickets/${id}/transfer`} className="flex items-center justify-between w-full p-4">
            <div className="flex items-center gap-3">
              <Send className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Transfer Ticket</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
          <Link to={`/sell/new?ticket=${id}`} className="flex items-center justify-between w-full p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Sell Ticket</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
        </div>
      </div>

      {/* Fullscreen QR Modal */}
      {showQR && (
        <div 
          className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-8"
          onClick={() => setShowQR(false)}
        >
          <button className="absolute top-4 right-4 text-gray-600">
            <span className="text-lg">✕</span>
          </button>
          <p className="text-lg font-semibold text-gray-900 mb-2">{mockTicket.eventName}</p>
          <p className="text-gray-500 mb-6">{mockTicket.ticketType}</p>
          <div className="w-64 h-64 bg-gray-100 rounded-2xl flex items-center justify-center">
            <QrCode className="w-48 h-48 text-gray-800" />
          </div>
          <p className="text-sm text-gray-500 mt-6">{mockTicket.holderName}</p>
          <p className="text-xs text-gray-400 mt-1">Tap anywhere to close</p>
        </div>
      )}
    </div>
  );
}
