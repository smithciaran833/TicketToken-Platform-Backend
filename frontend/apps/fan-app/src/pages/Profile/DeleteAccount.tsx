import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export default function DeleteAccount() {
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmed = confirmText === "DELETE";

  const handleDelete = async () => {
    if (!isConfirmed) return;

    setIsDeleting(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // In reality, would log out and redirect to confirmation
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Delete Account</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Warning */}
        <div className="bg-red-50 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <h2 className="font-semibold text-red-800">This action cannot be undone</h2>
            <p className="text-sm text-red-700 mt-1">
              Deleting your account will permanently remove all your data, including purchase history, tickets, and NFT collectibles.
            </p>
          </div>
        </div>

        {/* What You'll Lose */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">You will lose access to:</h3>
          <ul className="space-y-2 text-gray-600">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              All purchased tickets (past and upcoming)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              Your NFT collectible collection
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              Saved payment methods
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              Order history and receipts
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
              Active resale listings
            </li>
          </ul>
        </div>

        {/* Confirmation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type DELETE to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        {/* Delete Button */}
        <button
          onClick={handleDelete}
          disabled={!isConfirmed || isDeleting}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            isConfirmed && !isDeleting
              ? "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isDeleting ? "Deleting Account..." : "Delete My Account"}
        </button>

        {/* Cancel */}
        <button
          onClick={() => navigate(-1)}
          className="w-full py-3 text-gray-600 font-medium hover:text-gray-900 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
