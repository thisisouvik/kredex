"use client";

import type { Testimonial } from "@/types/landing";

interface TestimonialsSectionProps {
  items: Testimonial[];
}

export function TestimonialsSection({ items }: TestimonialsSectionProps) {
  return (
    <section className="section-anchor py-20" id="testimonials">
      <div className="crypto-container">
        <h2 className="heading-xl text-center" style={{ marginBottom: "3rem" }}>
          Trusted by <span className="hero-title-accent">Borrowers & Lenders</span>
        </h2>
        <div className="testimonial-grid">
          {items.map((item, index) => (
            <article key={index} className="glass-panel testimonial-card">
              <div className="testimonial-header">
                <img
                  src={item.avatar}
                  alt={item.name}
                  className="testimonial-avatar"
                />
                <div>
                  <h3 className="heading-md">{item.name}</h3>
                  <p className="text-secondary" style={{ fontSize: "0.85rem" }}>{item.role}</p>
                </div>
              </div>
              <p className="text-secondary" style={{ fontStyle: "italic", lineHeight: 1.7 }}>
                "{item.review}"
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
