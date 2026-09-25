import Image from 'next/image';

interface ConfigErrorScreenProps {
  /** List of missing or invalid configuration items. */
  issues: string[];
}

/**
 * Shown when required environment variables are missing or invalid at startup.
 * Keeps users informed rather than silently failing or producing cryptic errors.
 */
export function ConfigErrorScreen({ issues }: ConfigErrorScreenProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="max-w-lg w-full space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <Image
            src="/Logo.svg"
            alt="LyricsFlip"
            width={126}
            height={42}
            priority
            className="object-contain"
          />
        </div>

        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center">
            <span className="text-4xl" role="img" aria-label="warning">
              ⚠️
            </span>
          </div>
        </div>

        {/* Heading */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">
            App is not configured
          </h1>
          <p className="text-gray-500 text-sm">
            One or more required environment variables are missing. The game
            cannot connect to the Stellar network until they are set.
          </p>
        </div>

        {/* Issue list */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-yellow-800 mb-2">
            Missing configuration:
          </p>
          <ul className="space-y-1">
            {issues.map((issue, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-yellow-700"
              >
                <span className="mt-0.5 shrink-0">•</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Instructions */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-2">
          <p className="font-semibold text-gray-800">How to fix:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>
              Copy{' '}
              <code className="bg-gray-200 px-1 rounded text-xs font-mono">
                frontend/.env.example
              </code>{' '}
              to{' '}
              <code className="bg-gray-200 px-1 rounded text-xs font-mono">
                frontend/.env.local
              </code>
            </li>
            <li>Fill in the missing values from your Stellar deployment.</li>
            <li>Restart the development server.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
