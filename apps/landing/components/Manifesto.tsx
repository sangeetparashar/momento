'use client';

export default function Manifesto() {
  return (
    <section className="py-16 md:py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-mono text-2xl md:text-4xl lg:text-5xl font-bold text-white leading-[1.15] tracking-tight uppercase">
          Creators earn pennies.
        </h2>
        <h2 className="font-mono text-2xl md:text-4xl lg:text-5xl font-bold text-[#333333] leading-[1.15] tracking-tight mt-2 uppercase">
          Fans get likes. Not equity.
        </h2>

        <div className="mt-10">
          <div className="section-divider mb-6" />
          <p className="font-mono text-xl md:text-2xl font-bold text-momento-primary uppercase tracking-wider">
            Momento flips this.
          </p>
        </div>
      </div>
    </section>
  );
}
