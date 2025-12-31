import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus } from "lucide-react";

const mockEvent = {
  id: "1",
  title: "Japanese Breakfast",
  date: "Sat, Jul 15",
  venue: "The Fillmore",
};

const mockTicketTypes = [
  { 
    id: "ga", 
    name: "General Admission", 
    description: "Standing room on the floor",
    price: 45, 
    available: 150,
    limit: 4 
  },
  { 
    id: "balcony", 
    name: "Balcony", 
    description: "Reserved balcony seating with great views",
    price: 65, 
    available: 40,
    limit: 4 
  },
  { 
    id: "vip", 
    name: "VIP Package", 
    description: "Early entry, exclusive merch, meet & greet",
    price: 150, 
    available: 0,
    limit: 2 
  },
];

export default function SelectTickets() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const updateQuantity = (ticketId: string, delta: number) => {
    const ticket = mockTicketTypes.find(t => t.id === ticketId);
    if (!ticket || ticket.available === 0) return;

    setQuantities(prev => {
      const current = prev[ticketId] || 0;
      const newQty = Math.max(0, Math.min(current + delta, ticket.limit, ticket.available));
      
      if (newQty === 0) {
        const { [ticketId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [ticketId]: newQty };
    });
  };

  const totalTickets = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const subtotal = Object.entries(quantities).reduce((sum, [ticketId, qty]) => {
    const ticket = mockTicketTypes.find(t => t.id === ticketId);
    return sum + (ticket?.price || 0) * qty;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-5 py-4 border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">Select Tickets</h1>
            <p className="text-sm text-gray-500">{mockEvent.title}</p>
          </div>
        </div>
      </header>

      {/* Event Context */}
      <div className="bg-white px-5 py-3 border-b border-gray-100">
        <p className="text-sm text-gray-600">
          {mockEvent.date} · {mockEvent.venue}
        </p>
      </div>

      {/* Ticket Types */}
      <div className="p-5 space-y-3">
        {mockTicketTypes.map((ticket) => {
          const qty = quantities[ticket.id] || 0;
          const soldOut = ticket.available === 0;

          return (
            <div 
              key={ticket.id}
              className={`bg-white rounded-2xl p-5 shadow-sm transition-all ${
                soldOut ? "opacity-60" : ""
              } ${qty > 0 ? "ring-2 ring-purple-600 ring-offset-2" : ""}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 mr-4">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{ticket.name}</h3>
                    {soldOut && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                        Sold Out
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{ticket.description}</p>
                </div>
                <p className="text-xl font-bold text-gray-900">${ticket.price}</p>
              </div>

              {!soldOut && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Limit {ticket.limit} per order</p>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => updateQuantity(ticket.id, -1)}
                      disabled={qty === 0}
                      className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-300 active:scale-95"
                    >
                      <Minus className="w-4 h-4 text-gray-600" />
                    </button>
                    <span className="w-6 text-center font-semibold text-lg text-gray-900">{qty}</span>
                    <button
                      onClick={() => updateQuantity(ticket.id, 1)}
                      disabled={qty >= ticket.limit || qty >= ticket.available}
                      className="w-9 h-9 rounded-full border-2 border-gray-200 flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-300 active:scale-95"
                    >
                      <Plus className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Footer */}
      {totalTickets > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
          <div className="max-w-lg mx-auto flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{totalTickets} ticket{totalTickets !== 1 ? "s" : ""}</p>
              <p className="text-2xl font-bold text-gray-900">${subtotal.toFixed(2)}</p>
            </div>
            <button
              onClick={() => navigate(`/event/${id}/checkout`, { state: { quantities, subtotal } })}
              className="bg-purple-600 text-white px-8 py-3.5 rounded-xl font-semibold text-lg shadow-lg shadow-purple-600/30 transition-all hover:bg-purple-700 active:scale-[0.98]"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Bottom padding */}
      <div className="h-28" />
    </div>
  );
}
