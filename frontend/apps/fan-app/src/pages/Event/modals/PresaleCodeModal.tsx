import { useState } from "react";
import { Ticket, Loader2 } from "lucide-react";
import Modal, { ModalFooter } from "../../../components/ui/Modal";

interface PresaleCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (code: string) => void;
}

export default function PresaleCodeModal({
  isOpen,
  onClose,
  onSuccess,
}: PresaleCodeModalProps) {
  const [code, setCode] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!code.trim()) return;

    setIsValidating(true);
    setError("");

    // Simulate API validation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock validation - accept "EARLYBIRD" or "VIP2025"
    const validCodes = ["EARLYBIRD", "VIP2025", "PRESALE"];
    if (validCodes.includes(code.toUpperCase())) {
      onSuccess(code.toUpperCase());
      setCode("");
      onClose();
    } else {
      setError("Invalid or expired presale code. Please try again.");
    }

    setIsValidating(false);
  };

  const handleClose = () => {
    setCode("");
    setError("");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Enter Presale Code" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl">
          <Ticket className="w-6 h-6 text-purple-600" />
          <p className="text-sm text-purple-700">
            Enter your presale code to unlock exclusive tickets before general sale.
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
            placeholder="Enter code"
            className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-900 placeholder-gray-400 uppercase tracking-wider text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
              error ? "border-red-300" : "border-gray-200"
            }`}
            maxLength={20}
          />
          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>

        <p className="text-sm text-gray-500 text-center">
          Don't have a code?{" "}
          <a href="#" className="text-purple-600 hover:underline">
            Learn how to get one
          </a>
        </p>
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
