import React from 'react';
import { ApiField, FieldValues } from '../../services/liveApi';

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[#2B2A27] text-xs focus:outline-none focus:border-[#4F7F6D]';

/** Renders the right control for a custom field type (text, number, date, dropdown, checkbox). */
export const FieldInput: React.FC<{
  field: ApiField;
  value: FieldValues[string] | undefined;
  onChange: (v: FieldValues[string]) => void;
  required?: boolean;
}> = ({ field, value, onChange, required }) => {
  const id = `field-${field.id}`;
  const label = (
    <label htmlFor={id} className="block text-xs font-mono text-[#78716A] uppercase mb-1">
      {field.label} {required && <span className="text-[#B97F2E]">(required in this stage)</span>}
    </label>
  );
  switch (field.type) {
    case 'NUMBER':
      return (
        <div>
          {label}
          <input id={id} type="number" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} />
        </div>
      );
    case 'DATE':
      return (
        <div>
          {label}
          <input id={id} type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} className={inputCls} />
        </div>
      );
    case 'DROPDOWN':
      return (
        <div>
          {label}
          <select id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>
            <option value="">— choose —</option>
            {field.options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      );
    case 'CHECKBOX':
      return (
        <label htmlFor={id} className="flex items-center gap-2 text-xs text-[#2B2A27] cursor-pointer">
          <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#4F7F6D]" />
          {field.label} {required && <span className="text-[#B97F2E] font-mono text-[10px]">(required in this stage)</span>}
        </label>
      );
    default:
      return (
        <div>
          {label}
          <input id={id} type="text" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        </div>
      );
  }
};

export { inputCls };
