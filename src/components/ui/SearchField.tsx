import { IconSearch } from '../icons';
import { useId } from 'react';
import { FormField } from './FormField';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  minWidth?: number;
  maxWidth?: number;
}

export function SearchField({ value, onChange, placeholder, label, minWidth = 180, maxWidth = 240 }: SearchFieldProps) {
  const id = useId();
  return (
    <div className="search-field" style={{ minWidth, maxWidth }}>
      <FormField label={label ?? placeholder} htmlFor={id}>
        <div className="search-input-wrap">
          <span className="search-icon"><IconSearch size={14} /></span>
          <input
            id={id}
            type="text"
            className="form-input form-select-sm search-input"
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label ?? placeholder}
          />
        </div>
      </FormField>
    </div>
  );
}
