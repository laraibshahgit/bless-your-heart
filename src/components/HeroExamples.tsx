import { useState } from 'react';

const EXAMPLES = [
  '/examples/hero-1.png',
  '/examples/hero-2.png',
  '/examples/hero-3.png',
];

export function HeroExamples() {
  const [mobileIndex] = useState(() => Math.floor(Math.random() * EXAMPLES.length));

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="hidden lg:grid grid-cols-3 gap-4">
        {EXAMPLES.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="eager"
            fetchPriority="high"
            className="w-full aspect-square rounded-xl object-cover"
          />
        ))}
      </div>
      <div className="lg:hidden flex justify-center">
        <img
          src={EXAMPLES[mobileIndex]}
          alt=""
          loading="eager"
          fetchPriority="high"
          className="w-[280px] aspect-square rounded-xl object-cover"
        />
      </div>
    </div>
  );
}
