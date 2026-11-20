import { useState } from "react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import { useStellar } from "@/lib/stellar/hooks/use-stellar";

export const AdminConfig = () => {
    const { systemCalls } = useStellar();
    const [cardsPerRound, setCardsPerRoundValue] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const numCards = parseInt(cardsPerRound);
        if (isNaN(numCards) || numCards <= 0) {
            setError("Please enter a valid number of cards");
            return;
        }
        
        if (!systemCalls) {
            setError("System calls not initialized");
            return;
        }

        setIsLoading(true);
        setError(null);
        
        try {
            await systemCalls.setCardsPerRound(numCards);
            setCardsPerRoundValue("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to set cards per round");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Admin Configuration</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="cardsPerRound" className="block text-sm font-medium text-gray-700">
                        Cards Per Round
                    </label>
                    <Input
                        id="cardsPerRound"
                        type="number"
                        value={cardsPerRound}
                        onChange={(e) => setCardsPerRoundValue(e.target.value)}
                        min="1"
                        required
                    />
                </div>
                <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Configuration"}
                </Button>
                {error && <p className="text-red-500 mt-2">{error}</p>}
            </form>
        </div>
    );
}; 