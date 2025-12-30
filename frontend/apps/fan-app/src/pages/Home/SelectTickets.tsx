import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Info } from "lucide-react";
import { Button } from "../../components/ui";

const mockEvent = {
  id: 1,
  name: "Summer Music Festival 2025",
  date: "Sat, Jul 15 • 4:00 PM",
  venue: "Central Park Great Lawn",
  ticketTypes: [
    { id: 1, name: "General Admission", price: 65, available: 500, limit: 8, description: "Standing room on the lawn" },
    { id: 2, name: "VIP Access", price: 150, available: 50, limit: 4, description: "Front stage area, private bars, lounge access" },
    { id: 3, name: "Premium Package", price: 300, available: 0, limit: 2, description: "Meet & greet, premium viewing, gift bag" },
  ],
};

export default function SelectTickets() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  const updateQuantity = (ticketId: number, delta: number) => {
    setQuantities(prev => {
      const current = prev[ticketId] || 0;
      const ticket = mockEvent.ticketTypes.find(t => t.id === ticketId);
      if (!ticket) return prev;
      
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
    const ticket = mockEvent.ticketTypes.find(t => t.id === Number(ticketId));
    return sum + (ticket?.price || 0) * qty;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <header className="bg-white px-4 py-3 sticky top-0 z-40 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">Select Tickets</h1>
            <p className="text-sm text-gray-500">{mockEvent.name}</p>
          </div>
        </div>
      </header>

      {/* Event Summary */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <p className="text-sm text-gray-600">{mockEvent.date}</p>
        <p className="text-sm text-gray-600">{mockEvent.venue}</p>
      </div>

      {/* Ticket Types */}
      <div className="p-4 space-y-3">
        {mockEvent.ticketTypes.map((ticket) => {
          const qty = quantities[ticket.id] || 0;
          const soldOut = ticket.available === 0;
          
          return (
            <div 
              key={ticket.id}
              className={`bg-white rounded-xl p-4 ${soldOut ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{ticket.name}</h3>
                    {soldOut && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        Sold Out
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{ticket.description}</p>
                  {!soldOut && ticket.available < 50 && (
                    <p className="text-sm text-orange-600 mt-1">Only {ticket.available} left</p>
                  )}
                </div>
                <p className="font-bold text-gray-900">${ticket.price}</p>
              </div>
              
              {!soldOut && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400">Limit {ticket.limit} per order</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuantity(ticket.id, -1)}
                      disabled={qty === 0}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center disabled:opacity-30"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-8 text-center font-semibold">{qty}</span>
                    <button
                      onClick={() => updateQuantity(ticket.id, 1)}
                      disabled={qty >= ticket.limit || qty >= ticket.available}
                      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center disabled:opacity-30"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Fee Disclosure */}
        <button className="flex items-center gap-2 text-sm text-gray-500 px-2">
          <Info className="w-4 h-4" />
          <span>Fees calculated at checkout</span>
        </button>
      </div>

      {/* Sticky Footer */}
      {totalTickets > 0 && (
        <div className="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-gray-500">{totalTickets} ticket{totalTickets !== 1 ? "s" : ""}</p>
              <p className="font-bold text-gray-900">${subtotal.toFixed(2)}</p>
            </div>
            <Button onClick={() => navigate(`/event/${id}/cart`)}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
