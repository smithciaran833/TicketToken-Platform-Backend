import { useState } from "react";
import { Tag, Loader2 } from "lucide-react";
import Modal, { ModalFooter } from "../../../components/ui/Modal";

interface PromoCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (code: string, discount: number) => void;
  subtotal: number;
}

export default function PromoCodeModal({
  isOpen,
  onClose,
  onSuccess,
  subtotal,
}: PromoCodeModalProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) return;

    setIsValidating(true);
    setError("");

    // Simulate API validation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock validation
    const promoCodes: Record<string, { type: "percent" | "fixed"; value: number }> = {
      SAVE10: { type: "percent", value: 10 },
      SAVE20: { type: "percent", value: 20 },
      "5OFF": { type: "fixed", value: 5 },
      "10OFF": { type: "fixed", value: 10 },
    };

    const promo = promoCodes[code.toUpperCase()];
    if (promo) {
      const discount =
        promo.type === "percent"
          ? Math.round(subtotal * (promo.value / 100) * 100) / 100
          : promo.value;
      onSuccess(code.toUpperCase(), discount);
      setCode("");
      onClose();
    } else {
      setError("Invalid or expired promo code. Please try again.");
    }

    setIsValidating(false);
  };

  const handleClose = () => {
    setCode("");
    setError("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Promo Code" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
          <Tag className="w-6 h-6 text-gray-400" />
          <p className="text-sm text-gray-600">
            Enter a promo code to get a discount on your order.
          </p>
        </div>

        <div>
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError("");
            }}
            placeholder="Enter promo code"
            className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-400 uppercase tracking-wider text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
              error ? "border-red-300" : "border-gray-200"
            }`}
            maxLength={20}
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      </div>

      <ModalFooter>
        <button
          onClick={handleClose}
          className="px-4 py-2 text-gray-600 font-medium hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!code.trim() || isValidating}
          className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors disabled:bg-gray-200 disabled:text-gray-400 flex items-center gap-2"
        >
          {isValidating && <Loader2 className="w-4 h-4 animate-spin" />}
          {isValidating ? "Validating..." : "Apply"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
