import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Ticket, Shield, Info } from "lucide-react";

const mockResaleListing = {
  id: "r1",
  eventId: "1",
  event: {
    title: "Japanese Breakfast",
    date: "Saturday, July 15, 2025",
    time: "8:00 PM",
    venue: "The Fillmore",
    city: "San Francisco, CA",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
  },
  ticketType: "General Admission",
  section: "Floor",
  quantity: 1,
  price: 65,
  fees: 9.75,
  total: 74.75,
  seller: {
    rating: 4.9,
    sales: 23,
  },
};

export default function ResaleTicketDetail() {
  const { listingId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Resale Ticket</h1>
        </div>
      </header>

      {/* Event Image */}
      <div className="relative aspect-video">
        <img
          src={mockResaleListing.event.image}
          alt={mockResaleListing.event.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-4 left-4">
          <span className="px-3 py-1.5 bg-orange-500 text-white text-sm font-semibold rounded-full">
            Resale
          </span>
        </div>
      </div>

      <div className="px-5 py-6 space-y-6">
        {/* Event Info */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{mockResaleListing.event.title}</h2>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 text-gray-600">
              <Calendar className="w-5 h-5 text-gray-400" />
              <span>{mockResaleListing.event.date} · {mockResaleListing.event.time}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <MapPin className="w-5 h-5 text-gray-400" />
              <span>{mockResaleListing.event.venue}, {mockResaleListing.event.city}</span>
            </div>
            <div className="flex items-center gap-3 text-gray-600">
              <Ticket className="w-5 h-5 text-gray-400" />
              <span>{mockResaleListing.ticketType} · {mockResaleListing.section}</span>
            </div>
          </div>
        </div>

        {/* Ticket Details */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Ticket Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">Ticket Type</span>
              <span className="font-medium text-gray-900">{mockResaleListing.ticketType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Section</span>
              <span className="font-medium text-gray-900">{mockResaleListing.section}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Quantity</span>
              <span className="font-medium text-gray-900">{mockResaleListing.quantity}</span>
            </div>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Price</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-600">
              <span>Ticket Price</span>
              <span>${mockResaleListing.price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Fees</span>
              <span>${mockResaleListing.fees.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-gray-900 pt-3 border-t border-gray-100">
              <span>Total</span>
              <span>${mockResaleListing.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Buyer Protection */}
        <div className="bg-green-50 rounded-xl p-4 flex gap-3">
          <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-green-800">Buyer Protection</p>
            <p className="text-sm text-green-700 mt-1">
              Your purchase is protected. If there's an issue with your tickets,
              we'll make it right or give you a full refund.
            </p>
          </div>
        </div>

        {/* Seller Info */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Info className="w-4 h-4" />
          <span>
            Sold by verified seller · {mockResaleListing.seller.rating} rating · {mockResaleListing.seller.sales} sales
          </span>
        </div>
      </div>

      {/* Buy Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-600">Total</span>
          <span className="text-2xl font-bold text-gray-900">${mockResaleListing.total.toFixed(2)}</span>
        </div>
        <Link
          to={`/event/${mockResaleListing.eventId}/checkout?resale=${listingId}`}
          className="block w-full py-3.5 bg-purple-600 text-white text-center font-semibold text-lg rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all"
        >
          Buy Now
        </Link>
      </div>
    </div>
  );
}
