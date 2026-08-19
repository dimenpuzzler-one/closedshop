import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`container ${className}`}>{children}</div>;
}

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}

export function Input({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return <label className="field">
    {label ? <span className="field-label">{label}</span> : null}
    <input className="input" {...props} />
    {hint ? <span className="field-hint">{hint}</span> : null}
  </label>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'accent' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Price({ amount, suffix = '원' }: { amount: number; suffix?: string }) {
  return <span className="price">{new Intl.NumberFormat('ko-KR').format(amount)}{suffix}</span>;
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return <div className="section-heading">
    {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
    <h2>{title}</h2>
    {description ? <p className="muted">{description}</p> : null}
  </div>;
}

export function StatCard({ label, value, detail, tone = 'default' }: { label: string; value: string; detail?: string; tone?: 'default' | 'accent' | 'success' }) {
  return <Card className={`stat-card stat-${tone}`}>
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{value}</strong>
    {detail ? <span className="stat-detail">{detail}</span> : null}
  </Card>;
}
