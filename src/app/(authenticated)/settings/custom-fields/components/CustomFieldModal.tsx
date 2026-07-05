import { useState, useEffect, useRef } from 'react'
import { CustomFieldCategory, CustomFieldDefinition } from '@/lib/types'
import { X, Plus, Trash, CaretDown, Check } from '@phosphor-icons/react'

interface Option {
    value: string
    label: string
}

function CustomSelect({
    value,
    onChange,
    options,
    disabled,
    placeholder
}: {
    value: string,
    onChange: (val: string) => void,
    options: Option[],
    disabled?: boolean,
    placeholder?: string
}) {
    const [isOpen, setIsOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const selected = options.find(o => o.value === value)

    return (
        <div className="relative w-full" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${disabled ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-100 focus:bg-white'}`}
            >
                <span className={selected ? 'text-gray-900' : 'text-gray-500'}>
                    {selected ? selected.label : placeholder}
                </span>
                <CaretDown size={16} weight="bold" className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg shadow-black/5 py-1.5 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-100">
                    {options.map((opt) => {
                        const isSelected = value === opt.value
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value)
                                    setIsOpen(false)
                                }}
                                className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center justify-between group ${isSelected ? 'bg-blue-50/50 text-blue-700' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'}`}
                            >
                                <span>{opt.label}</span>
                                {isSelected && <Check size={16} weight="bold" className="text-blue-600" />}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

interface CustomFieldModalProps {
    isOpen: boolean
    onClose: () => void
    field: CustomFieldDefinition | null
    categories: CustomFieldCategory[]
    onSubmit: (data: any) => Promise<void>
    onDelete?: () => Promise<void>
}

const FIELD_TYPES = [
    { value: 'text', label: 'Texto Curto' },
    { value: 'number', label: 'Número' },
    { value: 'currency', label: 'Moeda' },
    { value: 'date', label: 'Data' },
    { value: 'datetime', label: 'Data e Hora' },
    { value: 'bool', label: 'Verdadeiro/Falso' },
    { value: 'select', label: 'Seleção Única' },
    { value: 'multi_select', label: 'Múltipla Escolha' },
    { value: 'json', label: 'JSON / Estruturado' }
]

export function CustomFieldModal({ isOpen, onClose, field, categories, onSubmit, onDelete }: CustomFieldModalProps) {
    const [name, setName] = useState('')
    const [fieldType, setFieldType] = useState('text')
    const [categoryId, setCategoryId] = useState('')
    const [required, setRequired] = useState(false)
    const [description, setDescription] = useState('')
    const [options, setOptions] = useState<string[]>([])

    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setName(field?.name || '')
            setFieldType(field?.field_type || 'text')

            // Definição inteligente da categoria padrão
            let defaultCategory = field?.category_id || ''
            if (!field && categories && categories.length > 0) {
                // Se é campo novo e existem categorias, usa a última (mais recente)
                defaultCategory = categories[categories.length - 1].id
            }
            setCategoryId(defaultCategory)

            setRequired(field?.schema?.required || false)
            setDescription(field?.schema?.description || '')
            setOptions(field?.schema?.options || [])
            setIsSubmitting(false)
            setIsDeleting(false)
        }
    }, [isOpen, field, categories])

    if (!isOpen) return null

    const needsOptions = fieldType === 'select' || fieldType === 'multi_select'

    const handleAddOption = () => {
        setOptions([...options, ''])
    }

    const handleUpdateOption = (index: number, val: string) => {
        const newOptions = [...options]
        newOptions[index] = val
        setOptions(newOptions)
    }

    const handleRemoveOption = (index: number) => {
        setOptions(options.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || isSubmitting) return
        if (needsOptions && options.every(o => !o.trim())) return // Basic validation for options

        try {
            setIsSubmitting(true)
            await onSubmit({
                name: name.trim(),
                field_type: fieldType,
                category_id: categoryId || null,
                required,
                description: description.trim(),
                options: needsOptions ? options.filter(o => o.trim()) : []
            })
        } catch (error) {
            console.error(error)
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!onDelete || isDeleting) return
        try {
            setIsDeleting(true)
            await onDelete()
        } catch (err) {
            console.error(err)
            setIsDeleting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 modal-overlay-enter p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] modal-content-enter">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-bold font-display text-gray-900">
                        {field ? 'Editar Campo' : 'Novo Campo'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                    >
                        <X size={20} weight="bold" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="p-6 space-y-6 overflow-y-auto">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Nome */}
                            <div className="sm:col-span-2 space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Nome do Campo</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ex: CPF, Cargo, Escolaridade"
                                    className="w-full h-11 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                                />
                            </div>

                            {/* Tipo */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Tipo do Campo</label>
                                <CustomSelect
                                    value={fieldType}
                                    onChange={setFieldType}
                                    options={FIELD_TYPES}
                                    disabled={!!field}
                                />
                            </div>

                            {/* Categoria */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-gray-700">Categoria</label>
                                <CustomSelect
                                    value={categoryId}
                                    onChange={setCategoryId}
                                    options={[
                                        { value: '', label: 'Nenhuma (Outros)' },
                                        ...categories.map(c => ({ value: c.id, label: c.name }))
                                    ]}
                                    placeholder="Nenhuma (Outros)"
                                />
                            </div>
                        </div>

                        {/* Descrição */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-gray-700">Descrição <span className="text-gray-400 font-normal">(Opcional)</span></label>
                            <textarea
                                rows={2}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Exemplo de preenchimento ou ajuda para o usuário"
                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                            />
                        </div>

                        {/* Obrigatório */}
                        <label className="flex items-center gap-3 p-4 border border-gray-200 p-4 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors">
                            <input
                                type="checkbox"
                                checked={required}
                                onChange={e => setRequired(e.target.checked)}
                                className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900">Campo Obrigatório</span>
                                <span className="text-xs text-gray-500">Exige preenchimento antes de salvar o lead</span>
                            </div>
                        </label>

                        {/* Options (Dynamic) */}
                        {needsOptions && (
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-semibold text-gray-700">Opções de Seleção</label>
                                    <button
                                        type="button"
                                        onClick={handleAddOption}
                                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-blue-50 px-2 py-1 rounded"
                                    >
                                        <Plus weight="bold" /> Adicionar
                                    </button>
                                </div>
                                {options.length === 0 && (
                                    <p className="text-xs text-orange-600 font-medium bg-orange-50 p-3 rounded-lg">
                                        Adicione ao menos uma opção para este campo.
                                    </p>
                                )}
                                <div className="space-y-2">
                                    {options.map((opt, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={opt}
                                                onChange={e => handleUpdateOption(idx, e.target.value)}
                                                placeholder={`Opção ${idx + 1}`}
                                                className="flex-1 h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveOption(idx)}
                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            >
                                                <Trash size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-gray-50">
                        <div>
                            {field && onDelete && (
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={isDeleting || isSubmitting}
                                    className="text-red-500 hover:text-red-700 text-sm font-semibold transition-colors disabled:opacity-50 px-3 py-2 -ml-3 rounded hover:bg-red-50"
                                >
                                    {isDeleting ? '...' : 'Excluir'}
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting || isDeleting}
                                className="px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={!name.trim() || isSubmitting || isDeleting || (needsOptions && options.every(o => !o.trim()))}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
                            >
                                {isSubmitting ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    )
}
