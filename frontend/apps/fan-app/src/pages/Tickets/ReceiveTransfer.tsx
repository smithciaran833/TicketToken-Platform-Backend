import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Calendar, MapPin, Gift, User } from "lucide-react";

const mockTransfer = {
  id: "abc123",
  eventTitle: "Japanese Breakfast",
  eventSubtitle: "Jubilee Tour 2025",
  date: "Saturday, July 15, 2025",
  time: "8:00 PM",
  venue: "The Fillmore",
  city: "San Francisco, CA",
  ticketType: "General Admission",
  senderName: "John Smith",
  message: "Hey! Couldn't make it to the show. Enjoy!",
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
};

export default function ReceiveTransfer() {
  const { transferId: _transferId } = useParams();
  const navigate = useNavigate();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const handleAccept = async () => {
    setIsAccepting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    navigate("/tickets/1", { state: { justReceived: true } });
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-600 to-purple-800">
      {/* Hero Section */}
      <div className="pt-12 pb-8 px-5 text-center">
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Gift className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">You've Received a Ticket!</h1>
        <p className="text-purple-200">Someone sent you a ticket to an event</p>
      </div>

      {/* Ticket Card */}
      <div className="px-5 pb-8">
        <div className="bg-white rounded-3xl overflow-hidden shadow-xl">
          {/* Event Image */}
          <div className="aspect-video relative">
            <img
              src={mockTransfer.image}
              alt={mockTransfer.eventTitle}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Event Details */}
          <div className="p-6">
            <h2 className="text-2xl font-bold text-gray-900">{mockTransfer.eventTitle}</h2>
            {mockTransfer.eventSubtitle && (
              <p className="text-gray-500">{mockTransfer.eventSubtitle}</p>
            )}

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-gray-900">{mockTransfer.date}</p>
                  <p className="text-sm text-gray-500">{mockTransfer.time}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-gray-900">{mockTransfer.venue}</p>
                  <p className="text-sm text-gray-500">{mockTransfer.city}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <span className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded-full">
                {mockTransfer.ticketType}
              </span>
            </div>

            {/* Sender Info */}
            <div className="mt-6 p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">From</p>
                  <p className="font-medium text-gray-900">{mockTransfer.senderName}</p>
                </div>
              </div>
              {mockTransfer.message && (
                <p className="text-gray-600 italic mt-3">"{mockTransfer.message}"</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 space-y-3">
            <button
              onClick={handleAccept}
              disabled={isAccepting || isDeclining}
              className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all disabled:bg-purple-400"
            >
              {isAccepting ? "Accepting..." : "Accept Ticket"}
            </button>
            <button
              onClick={handleDecline}
              disabled={isAccepting || isDeclining}
              className="w-full py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-all disabled:bg-gray-50 disabled:text-gray-400"
            >
              {isDeclining ? "Declining..." : "Decline"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
