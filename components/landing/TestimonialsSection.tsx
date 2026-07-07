import type { Testimonial } from "@/types/landing";

interface TestimonialsSectionProps {
  items: Testimonial[];
}

export function TestimonialsSection({ items }: TestimonialsSectionProps) {
  return (
    <section className="section-anchor testimonials-section py-20 bg-slate-50/50">
      <div className="crypto-container">
        <h2 className="font-display text-3xl md:text-4xl text-center text-[#1d254a] mb-12">
          Trusted by Borrowers & Lenders
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {items.map((item, index) => (
            <article
              key={index}
              className="bg-white/80 backdrop-blur-xl p-8 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4 mb-6">
                <img
                  src={item.avatar}
                  alt={item.name}
                  className="w-12 h-12 rounded-full object-cover"
                />
                <div>
                  <h3 className="font-medium text-slate-900">{item.name}</h3>
                  <p className="text-sm text-slate-500">{item.role}</p>
                </div>
              </div>
              <p className="text-slate-700 italic">"{item.review}"</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
