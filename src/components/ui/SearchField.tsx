import { IconSearch } from '../icons';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  minWidth?: number;
  maxWidth?: number;
}

export function SearchField({ value, onChange, placeholder, label, minWidth = 180, maxWidth = 240 }: SearchFieldProps) {
  return (
    <div className="search-input-wrap" style={{ minWidth, maxWidth }}>
      <span className="search-icon"><IconSearch size={14} /></span>
      <input
        type="text"
        className="form-input form-select-sm search-input"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label ?? placeholder}
      />
    </div>
  );
}