import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, UserCheck, FileText } from "lucide-react";
import { Button, Toggle, Textarea, useToast, ToastContainer } from "../../components/ui";

export default function ResalePolicies() {
  const toast = useToast();

  const [buyerProtections, setBuyerProtections] = useState({
    guaranteeAuthentic: true,
    moneyBackGuarantee: true,
    deliveryGuarantee: true,
  });

  const [sellerRequirements, setSellerRequirements] = useState({
    verifiedAccount: true,
    bankAccountRequired: true,
    listingAccuracyPolicy: true,
  });

  const [customPolicy, setCustomPolicy] = useState(
    "All resale transactions are final. Tickets cannot be resold above 200% of face value. " +
    "Sellers must ensure ticket delivery within 24 hours of purchase."
  );

  const handleSave = () => {
    toast.success("Resale policies saved!");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/resale" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resale Policies</h1>
          <p className="text-gray-500">Configure buyer protections and seller requirements</p>
        </div>
      </div>

      {/* Buyer Protections */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Buyer Protections</h2>
            <p className="text-sm text-gray-500">Safeguards for ticket buyers</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Guarantee Authentic Tickets</p>
              <p className="text-sm text-gray-500">All tickets are verified on the blockchain</p>
            </div>
            <Toggle
              enabled={buyerProtections.guaranteeAuthentic}
              onChange={(val) => setBuyerProtections({ ...buyerProtections, guaranteeAuthentic: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Money-Back Guarantee</p>
              <p className="text-sm text-gray-500">Full refund if tickets are invalid or event is cancelled</p>
            </div>
            <Toggle
              enabled={buyerProtections.moneyBackGuarantee}
              onChange={(val) => setBuyerProtections({ ...buyerProtections, moneyBackGuarantee: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Delivery Guarantee</p>
              <p className="text-sm text-gray-500">Tickets delivered instantly via blockchain transfer</p>
            </div>
            <Toggle
              enabled={buyerProtections.deliveryGuarantee}
              onChange={(val) => setBuyerProtections({ ...buyerProtections, deliveryGuarantee: val })}
            />
          </div>
        </div>
      </div>

      {/* Seller Requirements */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Seller Requirements</h2>
            <p className="text-sm text-gray-500">Requirements for listing tickets</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Verified Account Required</p>
              <p className="text-sm text-gray-500">Sellers must verify their identity</p>
            </div>
            <Toggle
              enabled={sellerRequirements.verifiedAccount}
              onChange={(val) => setSellerRequirements({ ...sellerRequirements, verifiedAccount: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Bank Account Required</p>
              <p className="text-sm text-gray-500">Sellers must have a connected payout method</p>
            </div>
            <Toggle
              enabled={sellerRequirements.bankAccountRequired}
              onChange={(val) => setSellerRequirements({ ...sellerRequirements, bankAccountRequired: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Listing Accuracy Policy</p>
              <p className="text-sm text-gray-500">Sellers must accurately describe tickets</p>
            </div>
            <Toggle
              enabled={sellerRequirements.listingAccuracyPolicy}
              onChange={(val) => setSellerRequirements({ ...sellerRequirements, listingAccuracyPolicy: val })}
            />
          </div>
        </div>
      </div>

      {/* Custom Policy */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Custom Policy</h2>
            <p className="text-sm text-gray-500">Additional terms displayed to buyers and sellers</p>
          </div>
        </div>

        <Textarea
          label=""
          value={customPolicy}
          onChange={(e) => setCustomPolicy(e.target.value)}
          rows={5}
          placeholder="Enter any additional resale policies..."
        />
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Policies</Button>
      </div>
    </div>
  );
}
