'use client'

import Link from 'next/link'
import { ArrowRight } from '@phosphor-icons/react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps {
    variant?: ButtonVariant
    href?: string
    onClick?: () => void
    type?: 'button' | 'submit'
    disabled?: boolean
    className?: string
    showArrow?: boolean
    children: React.ReactNode
}

const base = 'group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed'

const variants: Record<ButtonVariant, string> = {
    primary: 'bg-gradient-to-r from-[#4f8bff] to-[#2f6bf0] text-white shadow-sm hover:shadow-glow',
    secondary: 'bg-transparent border border-line text-ink hover:border-accent-line',
    ghost: 'bg-transparent text-muted hover:text-ink',
}

export default function Button({
    variant = 'primary',
    href,
    onClick,
    type = 'button',
    disabled,
    className = '',
    showArrow,
    children,
}: ButtonProps) {
    const classes = `${base} ${variants[variant]} ${className}`
    const content = (
        <>
            {children}
            {showArrow && (
                <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-1" />
            )}
        </>
    )

    if (href) {
        return (
            <Link href={href} className={classes}>
                {content}
            </Link>
        )
    }

    return (
        <button type={type} onClick={onClick} disabled={disabled} className={classes}>
            {content}
        </button>
    )
}
