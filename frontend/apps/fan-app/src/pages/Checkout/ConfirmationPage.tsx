import { useParams, useNavigate, Link } from "react-router-dom";
import { Check, Calendar } from "lucide-react";

const mockEvent = {
  title: "Japanese Breakfast",
  subtitle: "Jubilee Tour 2025",
  date: "Saturday, July 15, 2025",
  time: "8:00 PM",
  venue: "The Fillmore",
  image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
};

export default function ConfirmationPage() {
  const { id: _id } = useParams();
  const navigate = useNavigate();
  const orderNumber = `TKT-${Date.now().toString(36).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white px-5 pt-12 pb-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" strokeWidth={3} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">You're going!</h1>
        <p className="text-gray-500">Check your email for confirmation</p>
      </div>

      <div className="px-5 -mt-2">
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex gap-4 p-4">
            <img src={mockEvent.image} alt={mockEvent.title} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900">{mockEvent.title}</h2>
              <p className="text-sm text-gray-500">{mockEvent.subtitle}</p>
              <p className="text-sm text-gray-500 mt-1">{mockEvent.date} · {mockEvent.time}</p>
              <p className="text-sm text-gray-500">{mockEvent.venue}</p>
            </div>
          </div>
          
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Order</p>
                <p className="font-mono text-sm font-medium text-gray-700">{orderNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Qty</p>
                <p className="text-sm font-medium text-gray-700">2 tickets</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 space-y-3">
        <Link
          to="/tickets/1"
          className="w-full bg-purple-600 text-white py-4 rounded-xl font-semibold text-lg shadow-lg shadow-purple-600/30 hover:bg-purple-700 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          View Tickets
        </Link>
        
        <button className="w-full bg-white text-gray-700 py-4 rounded-xl font-semibold border border-gray-200 hover:bg-gray-50 active:scale-[0.98] flex items-center justify-center gap-2">
          <Calendar className="w-5 h-5" />
          Add to Calendar
        </button>
      </div>

      <div className="px-5 pb-8">
        <h3 className="font-semibold text-gray-900 mb-3">What's next?</h3>
        <div className="space-y-3">
          {["Check your email", "Save your tickets", "Show QR code at entry"].map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-purple-600">{i + 1}</span>
              </div>
              <p className="font-medium text-gray-900 pt-1">{step}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-8">
        <button onClick={() => navigate("/")} className="w-full text-purple-600 font-medium py-3">
          Back to Home
        </button>
      </div>
    </div>
  );
}
