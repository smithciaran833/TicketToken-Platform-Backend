import { useNavigate } from "react-router-dom";
import { ArrowLeft, DollarSign, CheckCircle, Clock, XCircle } from "lucide-react";

interface Payout {
  id: string;
  amount: number;
  status: "completed" | "pending" | "failed";
  date: string;
  sale: {
    eventTitle: string;
    ticketType: string;
  };
}

const mockPayouts: Payout[] = [
  {
    id: "1",
    amount: 49.50,
    status: "pending",
    date: "Jul 12, 2025",
    sale: {
      eventTitle: "Japanese Breakfast",
      ticketType: "General Admission",
    },
  },
  {
    id: "2",
    amount: 108.00,
    status: "completed",
    date: "Jul 5, 2025",
    sale: {
      eventTitle: "Khruangbin",
      ticketType: "VIP",
    },
  },
  {
    id: "3",
    amount: 88.00,
    status: "completed",
    date: "Jun 28, 2025",
    sale: {
      eventTitle: "Turnstile",
      ticketType: "General Admission",
    },
  },
  {
    id: "4",
    amount: 45.00,
    status: "failed",
    date: "Jun 21, 2025",
    sale: {
      eventTitle: "Bon Iver",
      ticketType: "Floor",
    },
  },
];

const statusConfig = {
  completed: {
    icon: CheckCircle,
    color: "text-green-600",
    bg: "bg-green-100",
    label: "Completed",
  },
  pending: {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-100",
    label: "Pending",
  },
  failed: {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-100",
    label: "Failed",
  },
};

export default function PayoutHistory() {
  const navigate = useNavigate();

  const totalEarnings = mockPayouts
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);

  const pendingAmount = mockPayouts
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Payout History</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total Earned</p>
            <p className="text-2xl font-bold text-gray-900">${totalEarnings.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-amber-600">${pendingAmount.toFixed(2)}</p>
          </div>
        </div>

        {/* Payouts List */}
        {mockPayouts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <DollarSign className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No payouts yet</h2>
            <p className="text-gray-500">Payouts will appear here when your tickets sell</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockPayouts.map((payout) => {
              const status = statusConfig[payout.status];
              const StatusIcon = status.icon;

              return (
                <div
                  key={payout.id}
                  className="bg-white rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{payout.sale.eventTitle}</p>
                      <p className="text-sm text-gray-500">{payout.sale.ticketType}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">
                        ${payout.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${status.bg}`}>
                      <StatusIcon className={`w-4 h-4 ${status.color}`} />
                      <span className={`text-sm font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{payout.date}</p>
                  </div>

                  {payout.status === "failed" && (
                    <button className="w-full mt-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                      Retry Payout
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
