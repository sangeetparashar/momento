export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-6xl font-bold text-white">404</h1>
        <p className="text-[#666666] mt-4 font-mono text-sm">Page not found</p>
        <a href="/" className="inline-block mt-6 text-momento-primary font-mono text-sm hover:underline">
          Back to Momento
        </a>
      </div>
    </div>
  );
}
