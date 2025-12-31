import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Share2, Calendar, MapPin, Wallet, Send, MoreHorizontal } from "lucide-react";

const mockTicket = {
  id: "1",
  eventTitle: "Japanese Breakfast",
  eventSubtitle: "Jubilee Tour 2025",
  date: "Saturday, July 15, 2025",
  doorsTime: "7:00 PM",
  showTime: "8:00 PM",
  venue: {
    name: "The Fillmore",
    address: "1805 Geary Blvd, San Francisco, CA",
  },
  ticketType: "General Admission",
  holderName: "John Smith",
  orderNumber: "TKT-ABC123",
};

export default function TicketView() {
  const navigate = useNavigate();
  const [showFullscreen, setShowFullscreen] = useState(false);

  if (showFullscreen) {
    return (
      <div 
        className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6"
        onClick={() => setShowFullscreen(false)}
      >
        <button 
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center"
          onClick={() => setShowFullscreen(false)}
        >
          <span className="text-2xl text-gray-400">×</span>
        </button>

        <p className="text-lg font-semibold text-gray-900 mb-1">{mockTicket.eventTitle}</p>
        <p className="text-gray-500 mb-6">{mockTicket.ticketType}</p>

        <div className="w-64 h-64 bg-gray-100 rounded-2xl flex items-center justify-center mb-6">
          <svg viewBox="0 0 100 100" className="w-48 h-48">
            <rect x="10" y="10" width="25" height="25" fill="#111" rx="3"/>
            <rect x="65" y="10" width="25" height="25" fill="#111" rx="3"/>
            <rect x="10" y="65" width="25" height="25" fill="#111" rx="3"/>
            <rect x="15" y="15" width="15" height="15" fill="white" rx="2"/>
            <rect x="70" y="15" width="15" height="15" fill="white" rx="2"/>
            <rect x="15" y="70" width="15" height="15" fill="white" rx="2"/>
            <rect x="19" y="19" width="7" height="7" fill="#111" rx="1"/>
            <rect x="74" y="19" width="7" height="7" fill="#111" rx="1"/>
            <rect x="19" y="74" width="7" height="7" fill="#111" rx="1"/>
            <rect x="40" y="40" width="20" height="20" fill="#111" rx="2"/>
            <rect x="45" y="45" width="10" height="10" fill="white" rx="1"/>
          </svg>
        </div>

        <p className="text-sm text-gray-500">{mockTicket.holderName}</p>
        <p className="text-xs text-gray-400 mt-4">Tap anywhere to close</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h1 className="font-semibold text-gray-900">My Ticket</h1>
          </div>
          <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100">
            <Share2 className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </header>

      <div className="p-5">
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col items-center cursor-pointer" onClick={() => setShowFullscreen(true)}>
            <div className="w-48 h-48 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 hover:scale-[1.02] transition-transform">
              <svg viewBox="0 0 100 100" className="w-36 h-36">
                <rect x="10" y="10" width="25" height="25" fill="#111" rx="3"/>
                <rect x="65" y="10" width="25" height="25" fill="#111" rx="3"/>
                <rect x="10" y="65" width="25" height="25" fill="#111" rx="3"/>
                <rect x="15" y="15" width="15" height="15" fill="white" rx="2"/>
                <rect x="70" y="15" width="15" height="15" fill="white" rx="2"/>
                <rect x="15" y="70" width="15" height="15" fill="white" rx="2"/>
                <rect x="19" y="19" width="7" height="7" fill="#111" rx="1"/>
                <rect x="74" y="19" width="7" height="7" fill="#111" rx="1"/>
                <rect x="19" y="74" width="7" height="7" fill="#111" rx="1"/>
                <rect x="40" y="40" width="20" height="20" fill="#111" rx="2"/>
                <rect x="45" y="45" width="10" height="10" fill="white" rx="1"/>
              </svg>
            </div>
            <p className="text-sm text-gray-400">Tap to enlarge</p>
          </div>

          <div className="px-6 pb-6">
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">{mockTicket.eventTitle}</h2>
              <p className="text-purple-600 font-medium">{mockTicket.ticketType}</p>
            </div>

            <div className="relative my-5">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-gray-50 rounded-full" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-6 h-6 bg-gray-50 rounded-full" />
              <div className="border-t-2 border-dashed border-gray-200" />
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{mockTicket.date}</p>
                  <p className="text-sm text-gray-500">Doors {mockTicket.doorsTime} · Show {mockTicket.showTime}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">{mockTicket.venue.name}</p>
                  <p className="text-sm text-gray-500">{mockTicket.venue.address}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Ticket Holder</p>
                <p className="font-medium text-gray-900">{mockTicket.holderName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Order</p>
                <p className="font-mono text-sm text-gray-600">{mockTicket.orderNumber}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button className="flex items-center justify-center gap-2 bg-white py-4 rounded-xl font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:scale-[0.98]">
            <Wallet className="w-5 h-5" />
            Add to Wallet
          </button>
          <button className="flex items-center justify-center gap-2 bg-white py-4 rounded-xl font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:scale-[0.98]">
            <MapPin className="w-5 h-5" />
            Directions
          </button>
        </div>

        <div className="mt-5 bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          <button className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50">
            <Send className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">Transfer Ticket</span>
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-gray-50">
            <MoreHorizontal className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-700">More Options</span>
          </button>
        </div>
      </div>
    </div>
  );
}
