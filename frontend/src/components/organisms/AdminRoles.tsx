import { useEffect, useState } from "react";
import { Keypair } from "@stellar/stellar-sdk";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { useStellar } from "@/lib/stellar/hooks/useStellar";

export const AdminRoles = () => {
    const { account, systemCalls } = useStellar();
    const [isOwner, setIsOwner] = useState(false);
    const [address, setAddress] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!account || !systemCalls) {
            setIsOwner(false);
            return;
        }
        let cancelled = false;
        systemCalls.isOwner(account.address).then((owner) => {
            if (!cancelled) setIsOwner(owner);
        });
        return () => {
            cancelled = true;
        };
    }, [account, systemCalls]);

    if (!isOwner || !systemCalls) {
        return null;
    }

    const updateRole = async (isEnable: boolean) => {
        const recipient = address.trim();
        try {
            Keypair.fromPublicKey(recipient);
        } catch {
            setError("Please enter a valid Stellar address (G...)");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await systemCalls.setRole(recipient, isEnable);
            setAddress("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update admin role");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow mt-4">
            <h2 className="text-xl font-bold mb-4">Admins</h2>
            <div className="space-y-4">
                <div>
                    <label htmlFor="adminAddress" className="block text-sm font-medium text-gray-700">
                        Wallet Address
                    </label>
                    <Input
                        id="adminAddress"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="G..."
                    />
                </div>
                <div className="flex gap-2">
                    <Button type="button" disabled={isLoading} onClick={() => updateRole(true)}>
                        Grant Admin
                    </Button>
                    <Button type="button" variant="outline" disabled={isLoading} onClick={() => updateRole(false)}>
                        Revoke Admin
                    </Button>
                </div>
                {error && <p className="text-red-500 mt-2">{error}</p>}
            </div>
        </div>
    );
};
