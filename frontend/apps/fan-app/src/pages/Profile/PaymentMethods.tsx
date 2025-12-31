import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Plus, Star, Trash2 } from "lucide-react";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}

const initialMethods: PaymentMethod[] = [
  { id: "1", brand: "visa", last4: "4242", expiry: "12/25", isDefault: true },
  { id: "2", brand: "mastercard", last4: "8888", expiry: "06/26", isDefault: false },
];

export default function PaymentMethods() {
  const navigate = useNavigate();
  const [methods, setMethods] = useState(initialMethods);

  const setDefault = (id: string) => {
    setMethods((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === id }))
    );
  };

  const removeMethod = (id: string) => {
    if (confirm("Remove this payment method?")) {
      setMethods((prev) => prev.filter((m) => m.id !== id));
    }
  };

  const getBrandIcon = (brand: string) => {
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Payment Methods</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-4">
        {methods.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No payment methods</h2>
            <p className="text-gray-500 mb-6">Add a card to make purchases</p>
          </div>
        ) : (
          methods.map((method) => (
            <div
              key={method.id}
              className="bg-white rounded-xl p-4 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-gray-600" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">
                      {getBrandIcon(method.brand)} •••• {method.last4}
                    </p>
                    {method.isDefault && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">Expires {method.expiry}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
                {!method.isDefault && (
                  <button
                    onClick={() => setDefault(method.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    <Star className="w-4 h-4" />
                    Set as Default
                  </button>
                )}
                <button
                  onClick={() => removeMethod(method.id)}
                  className="flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>
            </div>
          ))
        )}

        <Link
          to="/profile/payment-methods/add"
          className="flex items-center justify-center gap-2 w-full py-4 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Payment Method
        </Link>
      </div>
    </div>
  );
}
