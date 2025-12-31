import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Minus, ParkingCircle, ShoppingBag, UtensilsCrossed } from "lucide-react";

interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "parking" | "merchandise" | "food";
  image?: string;
  maxQuantity: number;
}

const mockAddOns: AddOn[] = [
  {
    id: "parking-ga",
    name: "General Parking",
    description: "Standard parking in venue lot",
    price: 25,
    category: "parking",
    maxQuantity: 1,
  },
  {
    id: "parking-vip",
    name: "VIP Parking",
    description: "Premium spot close to entrance",
    price: 45,
    category: "parking",
    maxQuantity: 1,
  },
  {
    id: "merch-tshirt",
    name: "Tour T-Shirt",
    description: "Official Jubilee Tour shirt (pick up at venue)",
    price: 35,
    category: "merchandise",
    maxQuantity: 4,
  },
  {
    id: "merch-poster",
    name: "Limited Edition Poster",
    description: "Signed & numbered show poster",
    price: 50,
    category: "merchandise",
    maxQuantity: 2,
  },
  {
    id: "food-drink",
    name: "Drink Voucher",
    description: "Redeemable for 1 beer, wine, or cocktail",
    price: 12,
    category: "food",
    maxQuantity: 10,
  },
  {
    id: "food-combo",
    name: "Food & Drink Combo",
    description: "1 drink + choice of snack",
    price: 20,
    category: "food",
    maxQuantity: 10,
  },
];

const categoryIcons = {
  parking: ParkingCircle,
  merchandise: ShoppingBag,
  food: UtensilsCrossed,
};

const categoryLabels = {
  parking: "Parking",
  merchandise: "Merchandise",
  food: "Food & Drink",
};

export default function SelectAddOns() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selections, setSelections] = useState<Record<string, number>>({});

  const updateQuantity = (addOnId: string, delta: number, max: number) => {
    setSelections((prev) => {
      const current = prev[addOnId] || 0;
      const newValue = Math.max(0, Math.min(current + delta, max));
      if (newValue === 0) {
        const { [addOnId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [addOnId]: newValue };
    });
  };

  const totalItems = Object.values(selections).reduce((sum, qty) => sum + qty, 0);
  const totalPrice = mockAddOns.reduce((sum, addOn) => {
    return sum + (selections[addOn.id] || 0) * addOn.price;
  }, 0);

  const groupedAddOns = mockAddOns.reduce((acc, addOn) => {
    if (!acc[addOn.category]) acc[addOn.category] = [];
    acc[addOn.category].push(addOn);
    return acc;
  }, {} as Record<string, AddOn[]>);

  const handleContinue = () => {
    navigate(`/event/${id}/cart`, { state: { addOns: selections } });
  };

  const handleSkip = () => {
    navigate(`/event/${id}/cart`);
  };

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Add-Ons</h1>
          </div>
          <button
            onClick={handleSkip}
            className="text-purple-600 font-medium hover:text-purple-700"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Add-Ons List */}
      <div className="px-5 py-6 space-y-8">
        {(Object.keys(groupedAddOns) as Array<keyof typeof categoryIcons>).map((category) => {
          const Icon = categoryIcons[category];
          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-5 h-5 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                  {categoryLabels[category]}
                </h2>
              </div>

              <div className="space-y-3">
                {groupedAddOns[category].map((addOn) => {
                  const quantity = selections[addOn.id] || 0;
                  return (
                    <div
                      key={addOn.id}
                      className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{addOn.name}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{addOn.description}</p>
                        <p className="text-purple-600 font-semibold mt-1">${addOn.price}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        {quantity > 0 ? (
                          <>
                            <button
                              onClick={() => updateQuantity(addOn.id, -1, addOn.maxQuantity)}
                              className="w-9 h-9 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
                            >
                              <Minus className="w-4 h-4 text-gray-600" />
                            </button>
                            <span className="w-6 text-center font-semibold text-gray-900">
                              {quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(addOn.id, 1, addOn.maxQuantity)}
                              disabled={quantity >= addOn.maxQuantity}
                              className="w-9 h-9 bg-purple-600 rounded-full flex items-center justify-center hover:bg-purple-700 transition-colors disabled:bg-gray-200"
                            >
                              <Plus className="w-4 h-4 text-white" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => updateQuantity(addOn.id, 1, addOn.maxQuantity)}
                            className="px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-full hover:bg-purple-700 transition-colors"
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            {totalItems > 0 ? (
              <>
                <p className="text-sm text-gray-500">{totalItems} item{totalItems !== 1 && "s"}</p>
                <p className="text-xl font-bold text-gray-900">+${totalPrice}</p>
              </>
            ) : (
              <p className="text-gray-500">No add-ons selected</p>
            )}
          </div>
          <button
            onClick={handleContinue}
            className="px-8 py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
