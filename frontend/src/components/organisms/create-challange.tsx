import { X } from 'lucide-react';
import { useState } from 'react';
import { useStellar } from '@/lib/stellar/hooks/useStellar';
import type { Genre } from '@/lib/stellar/types';
import { useRouter } from 'next/navigation';

// Maps the form's genre <select> values to the contract's Genre variants.
const FORM_GENRE_TO_CONTRACT_GENRE: Record<string, Genre> = {
  hiphop: 'HipHop',
  afrobeats: 'Afrobeat',
  pop: 'Pop',
};

export default function CreateChallenge() {
  const router = useRouter();
  const { systemCalls } = useStellar();
  const currency_Amount = { STRK: '18,678', USD: '5,676' };
  const [formData, setFormData] = useState({
    genre: '',
    level: '',
    duration: '',
    numbersOfPlayers: '',
    amount: '',
  });
  const [errors, setErrors] = useState({
    genre: '',
    level: '',
    duration: '',
    numbersOfPlayers: '',
    amount: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Clear error when user starts typing
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    let valid = true;
    const newErrors = { ...errors };

    if (!formData.genre) {
      newErrors.genre = 'Please select a genre';
      valid = false;
    }
    if (!formData.level) {
      newErrors.level = 'Please select a difficulty level';
      valid = false;
    }
    if (!formData.duration) {
      newErrors.duration = 'Please select a duration';
      valid = false;
    }
    if (!formData.numbersOfPlayers) {
      newErrors.numbersOfPlayers = 'Please select number of players';
      valid = false;
    }
    if (!formData.amount) {
      newErrors.amount = 'Please enter wager amount';
      valid = false;
    } else if (isNaN(Number(formData.amount))) {
      newErrors.amount = 'Amount must be a number';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);
    setError(null);

    if (!systemCalls) {
      setError('System calls not initialized');
      setIsLoading(false);
      return;
    }

    try {
      const genre = FORM_GENRE_TO_CONTRACT_GENRE[formData.genre];
      if (!genre) {
        setError('Invalid genre selected');
        return;
      }
      const roundId = await systemCalls.createRound(genre);
      router.push(`/multiplayer/${roundId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create challenge');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  return (
    <div className="w-full h-auto bg-black/10 flex justify-end p-10">
      <div className="w-full max-w-[580px] min-h-[960px] h-full bg-white rounded-[16px] border-[1.5px] border-[#DBE2E8] p-[32px]">
        <div className="flex justify-end">
          <p
            className="hover:cursor-pointer w-fit border border-[#DBE1E7] rounded-full"
            onClick={handleClose}
          >
            <X size={16} color="#090909" />
          </p>
        </div>

        <div className="w-full flex flex-col gap-[4px]">
          <h1
            aria-label="Wager (Multi Player) "
            className="text-[24px] font-[600]"
          >
            Wager (Multi Player)
          </h1>
          <p className="text-[14px] font-[400] text-[#120029]">
            Create a multiplayer round, set your wager, and invite friends to compete for the pot.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-[16px] text-[#212121] text-[14px] mt-5"
        >
          <div className="flex flex-col gap-[8px]">
            <label className="font-[500]" htmlFor="genre">
              Genre
            </label>
            <div className="border border-[#DBE2E8] px-[12px] rounded-[4px]">
              <select
                className="outline-none w-full p-[12px]"
                name="genre"
                id="genre"
                value={formData.genre}
                onChange={handleChange}
              >
                <option value="">Select a genre</option>
                <option value="hiphop">Hip Hop</option>
                <option value="afrobeats">Afro beats</option>
                <option value="pop">Pop</option>
              </select>
            </div>
            {errors.genre && (
              <p className="text-red-500 text-xs">{errors.genre}</p>
            )}
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-[500]" htmlFor="level">
              Difficulty Level
            </label>
            <div className="border border-[#DBE2E8] px-[12px] rounded-[4px]">
              <select
                className="outline-none w-full p-[12px]"
                name="level"
                id="level"
                value={formData.level}
                onChange={handleChange}
              >
                <option value="">Select difficulty</option>
                <option value="easy">Easy</option>
                <option value="normal">Normal</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            {errors.level && (
              <p className="text-red-500 text-xs">{errors.level}</p>
            )}
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-[500]" htmlFor="duration">
              Duration
            </label>
            <div className="border border-[#DBE2E8] px-[12px] rounded-[4px]">
              <select
                className="outline-none w-full p-[12px]"
                name="duration"
                id="duration"
                value={formData.duration}
                onChange={handleChange}
              >
                <option value="">Select duration</option>
                <option value="15">15 sec</option>
                <option value="30">30 sec</option>
                <option value="60">60 sec</option>
              </select>
            </div>
            {errors.duration && (
              <p className="text-red-500 text-xs">{errors.duration}</p>
            )}
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-[500]" htmlFor="numbersOfPlayers">
              Number of Players
            </label>
            <div className="border border-[#DBE2E8] px-[12px] rounded-[4px]">
              <select
                className="outline-none w-full p-[12px]"
                name="numbersOfPlayers"
                id="numbersOfPlayers"
                value={formData.numbersOfPlayers}
                onChange={handleChange}
              >
                <option value="">Select players</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
            {errors.numbersOfPlayers && (
              <p className="text-red-500 text-xs">{errors.numbersOfPlayers}</p>
            )}
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-[500]" htmlFor="amount">
              Wager Amount
            </label>
            <div className="border border-[#DBE2E8] px-[12px] rounded-[4px]">
              <input
                className="outline-none appearance-none w-full p-[12px]"
                type="number"
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                placeholder="Enter amount"
                min="0"
                step="1"
                onKeyDown={(e) => {
                  if (e.key === '-' || e.key === 'e' || e.key === 'E') {
                    e.preventDefault();
                  }
                }}
              />
            </div>
            {errors.amount && (
              <p className="text-red-500 text-xs">{errors.amount}</p>
            )}
            <p className="flex space-x-2 items-center">
              <span className="font-[400] text-[12px]">Wallet Balance:</span>
              {currency_Amount &&
                Object.entries(currency_Amount).map(
                  ([key, value]: [string, string]) => (
                    <span
                      key={key}
                      className="font-[500] text-[#9747FF] text-[12px]"
                    >
                      {' '}
                      {value} {key}
                    </span>
                  ),
                )}
            </p>
          </div>

          <div className="w-full mt-20">
            <button
              type="submit"
              className="text-[16px] font-[500] w-full hover:bg-transparent hover:border border-[#9747FF] hover:text-[#9747FF] transition-colors duration-200 rounded-full bg-[#9747FF] text-white py-[24px]"
            >
              Create Challenge
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
