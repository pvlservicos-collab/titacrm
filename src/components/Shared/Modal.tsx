'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title?: string
    children: React.ReactNode
    maxWidthClassName?: string
}

export default function Modal({ isOpen, onClose, title, children, maxWidthClassName = 'max-w-md' }: ModalProps) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        if (!isOpen) return
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', handleEsc)
        return () => document.removeEventListener('keydown', handleEsc)
    }, [isOpen, onClose])

    if (!mounted || !isOpen) return null

    return createPortal(
        <div className="fixed inset-0 z-[100]">
            <div className="absolute inset-0 bg-black/60 modal-overlay-enter" onClick={onClose} />
            <div className="flex items-center justify-center min-h-screen p-4 pointer-events-none">
                <div
                    className={`bg-panel border border-line rounded-2xl shadow-2xl w-full ${maxWidthClassName} overflow-hidden modal-content-enter pointer-events-auto relative z-10`}
                >
                    {title && (
                        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
                            <h2 className="text-lg font-bold text-ink">{title}</h2>
                            <button onClick={onClose} className="text-muted hover:text-ink transition-colors p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                    {children}
                </div>
            </div>
        </div>,
        document.body
    )
}
