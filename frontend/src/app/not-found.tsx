import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image
            src="/Logo.svg"
            alt="LyricsFlip"
            width={126}
            height={42}
            priority
            className="object-contain"
          />
        </div>

        {/* 404 Illustration */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-purple-100 flex items-center justify-center">
            <span className="text-5xl" role="img" aria-label="musical note">
              🎶
            </span>
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-[#9747FF]">404</h1>
          <h2 className="text-xl font-semibold text-gray-900">
            Page not found
          </h2>
          <p className="text-gray-500 text-sm">
            Looks like this track doesn&apos;t exist. The page you&apos;re
            looking for has been removed or never existed.
          </p>
        </div>

        {/* Action */}
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-[#9747FF] text-white font-medium rounded-lg hover:bg-[#8030e0] transition-colors min-h-[44px]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
