'use client'

import { Check } from '@phosphor-icons/react'

interface OnboardingStepperProps {
    steps: string[]
    currentStep: number
    completedSteps: boolean[]
}

export default function OnboardingStepper({ steps, currentStep, completedSteps }: OnboardingStepperProps) {
    return (
        <div className="flex items-start justify-center gap-1.5 sm:gap-3">
            {steps.map((label, i) => {
                const isActive = i === currentStep
                const isDone = completedSteps[i]
                return (
                    <div key={label} className="flex items-start gap-1.5 sm:gap-3">
                        <div className="flex flex-col items-center gap-1.5 w-14 sm:w-20">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${isDone
                                        ? 'bg-accent border-accent text-white'
                                        : isActive
                                            ? 'border-accent text-accent-2 bg-panel-2'
                                            : 'border-line text-muted bg-panel'
                                    }`}
                            >
                                {isDone ? <Check size={16} weight="bold" /> : i + 1}
                            </div>
                            <span
                                className={`text-[10px] font-semibold uppercase tracking-wide text-center leading-tight ${isActive || isDone ? 'text-ink' : 'text-muted'
                                    }`}
                            >
                                {label}
                            </span>
                        </div>
                        {i < steps.length - 1 && (
                            <div className={`w-6 sm:w-12 h-px mt-4 ${isDone ? 'bg-accent' : 'bg-line'}`} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
